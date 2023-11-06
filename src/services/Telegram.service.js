import TelegramBot from 'node-telegram-bot-api';
import _debug from 'debug';

const debug = _debug('telegram-service');

/**
 * @property gitlab {GitlabService}
 * @property storage {StorageService}
 */
export class TelegramService {
  /**
   * @param token {string}
   * @param urlWebHook {string | boolean}
   * @param gitlab {GitlabService}
   * @param storage {StorageService}
   */
  constructor(token, urlWebHook, gitlab, storage) {
    this.gitlab = gitlab;
    this.storage = storage;
    this.bot = new TelegramBot(token, urlWebHook ? {} : {polling: true});
    if (urlWebHook) {
      this.bot.setWebHook(urlWebHook).catch(console.error);
    }

    this.bot.onText(/^\/start$/, async (msg, match) => {
      if (!this.storage.ownerUserId) {
        this.storage.setOwnerUserId(msg.from.id);
      }

      await this.botMessage(
        msg.chat.id,
        `Доступные команды:`,
        ``,
        `/add \`GITLAB_PROJECT_URL\``,
        ` - подписаться на события в проекте`,
        ``,
        `/del \`GITLAB_PROJECT_URL\``,
        ` - отменить подписку`,
        ``,
        `/list`,
        ` - список проектов в подписках`,
        ``,
        `/register`,
        ` - подать заявку на модерирование`,
      );
    });

    this.bot.onText(/^\/add\s+([^\s]+)/, async (msg, match) => {
      const projectUrl = match[1];
      try {
        storage.checkAccess(msg.from.id);
        const webhook = await this.gitlab.addWebhook(projectUrl);
        storage.addProject(msg.from.id, msg.chat.id, projectUrl);
        await this.botMessage(
          msg.chat.id,

          `Бот зарегистрирован в проекте:`,
          `${projectUrl + `/-/hooks/${webhook.id}/edit`}`,
        );
      } catch (e) {
        if (e.message === '404 Project Not Found') {
          return await this.botMessage(msg.chat.id, `Проект не найден`);
        }

        console.error(e);
        await this.botMessage(
          msg.chat.id,
          `Бот работает только с собственными репозиториями с ограниченным кругом участников.`,
          ``,
          `Обратитесь за подробной информацией к владельцу бота.`,
        );
      }
    });

    this.bot.onText(/^\/del\s+([^\s]+)/, async (msg, match) => {
      const projectUrl = match[1];
      try {
        const {chatCountByProjectUrl} = storage.delProject(
          msg.from.id,
          msg.chat.id,
          projectUrl,
        );
        if (chatCountByProjectUrl === 0) {
          await this.gitlab.delWebhook(projectUrl);
        }
        await this.botMessage(
          msg.chat.id,
          `Отслеживание событий в проекте:`,
          `${projectUrl}`,
          ``,
          `*Отключено*`,
        );
      } catch (e) {
        console.error(e);
        await this.botMessage(
          msg.chat.id,
          `Произошла ошибка.`,
          ``,
          `Обратитесь за подробной информацией к владельцу бота.`,
        );
      }
    });

    this.bot.onText(/\/list/, async msg => {
      const projects = storage.getProjects(msg.chat.id);
      if (!projects.length) {
        return await this.botMessage(msg.chat.id, 'Нет подписок.');
      }
      await this.botMessage(msg.chat.id, ...projects);
    });

    this.bot.onText(/\/register/, async msg => {
      await Promise.all(
        this.storage.users.map(userId => {
          return this.bot.sendMessage(
            userId,
            `Пользователь @${msg.from.username} запросил регистрацию.`,
            {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: 'Принять',
                      callback_data: [
                        msg.chat.id,
                        msg.message_id,
                        msg.from.id,
                        1,
                      ].join(':'),
                    },
                    {
                      text: 'Отклонить',
                      callback_data: [
                        msg.chat.id,
                        msg.message_id,
                        msg.from.id,
                        0,
                      ].join(':'),
                    },
                  ],
                ],
              },
            },
          );
        }),
      );
    });

    this.bot.on('callback_query', async query => {
      try {
        const [chatId, msgId, userId, status] = query.data.split(':');
        const isAccepted = Boolean(+status);
        if (isAccepted) {
          this.storage.addUser(query.from.id, userId);
        } else {
          this.storage.delUser(query.from.id, userId);
        }
        const initiatorUserName = `[${
          query.from.username ||
          [query.from.first_name, query.from.last_name].join(' ')
        }](tg://user?id=${query.from.id})`;
        const textStatus = `Заявка *${isAccepted ? 'принята' : 'ОТКЛОНЕНА'}*`;
        // Отправить ответ
        await this.bot.sendMessage(
          chatId,
          `${initiatorUserName} *${
            isAccepted ? 'принял' : 'отклонил'
          }* Вашу заявку [${userId}](tg://user?id=${userId}).`,
          {
            parse_mode: 'Markdown',
            reply_to_message_id: msgId,
          },
        );
        // Скорректировать статус в сообщении-запросе
        await this.bot.editMessageText(
          query.message.text + '\n\n' + textStatus,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: isAccepted ? 'Отклонить' : 'Принять',
                    callback_data: [
                      chatId,
                      msgId,
                      userId,
                      isAccepted ? 0 : 1,
                    ].join(':'),
                  },
                ],
              ],
            },
          },
        );
      } catch (e) {
        console.error(e);
      }
    });
  }

  /**
   * @param event {gitlab.PushEvent|gitlab.MergeRequestEvent}
   */
  async onGitlabEvents(event) {
    debug('Gitlab event: %j', event);
    switch (event.object_kind) {
      case 'push': {
        await this.onEventPush(event);
        break;
      }
      case 'merge_request': {
        await this.onEventMergeRequest(event);
        break;
      }
    }
  }

  /**
   * @param event {gitlab.PushEvent}
   */
  async onEventPush(event) {
    if (!event.commits) {
      return;
    }
    const commits = event.commits
      .map(
        x =>
          [
            `\`${x.author.name}\`: ${x.id.slice(0, 8)}`,
            `[${x.title}](${x.url})`,
          ].join('\n') + '\n',
      )
      .join('\n');

    const projectUrl = event.project.web_url;
    await Promise.all(
      this.storage.getChats(projectUrl).map(chatId => {
        return this.botMessage(
          chatId,
          `[${event.project.name}](${projectUrl}) новые изменения:`,
          ``,
          commits,
        );
      }),
    );
  }

  /**
   * @param event {gitlab.MergeRequestEvent}
   */
  async onEventMergeRequest(event) {
    const projectUrl = event.project.web_url;
    const attrs = event.object_attributes;
    // attrs.author_id
    // attrs.assignee_id
    const project = `[${event.project.name}](${projectUrl})`;
    const source = `[${attrs.source_branch}](${attrs.source.web_url}/-/commits/${attrs.source_branch})`;
    const target = `[${attrs.target_branch}](${attrs.target.web_url}/-/commits/${attrs.target_branch})`;

    const assigneeUsers = (event.assignees || []).map(x => x.name);
    const reviewerUsers = (event.reviewers || []).map(x => x.name);

    const assignees = `Ответственный: ${
      assigneeUsers.length > 0
        ? `\`${assigneeUsers.join('`, `')}\``
        : '*не назначен*'
    }`;
    const reviewers = `Ревьювер: ${
      reviewerUsers.length > 0
        ? `\`${reviewerUsers.join('`, `')}\``
        : '*не назначен*'
    }`;
    const title = `[${attrs.title}](${attrs.url})`;

    await Promise.all(
      this.storage.getChats(projectUrl).map(chatId => {
        return this.botMessage(
          chatId,
          `${project} запрос на слияние: *${attrs.state}*`,
          `${source} -> ${target}`,
          ``,
          assignees,
          reviewers,
          ``,
          title,
        );
      }),
    );
  }

  async botMessage(chatId, ...msgLines) {
    return this.bot.sendMessage(chatId, msgLines.join('\n'), {
      parse_mode: 'Markdown',
    });
  }
}
