import config from 'config';
import crypto from 'crypto';
import express from 'express';

import {TelegramService} from './services/Telegram.service.js';
import {GitlabService} from './services/Gitlab.service.js';
import {StorageService} from './services/Storage.service.mjs';
import {makePersistent} from './tools/makePersistent.mjs';

const port = config.get('server.port');
const webHookUrlPath = [
  '/bot',
  crypto.createHash('md5').update(config.get('bot.token')).digest('hex'),
].join('-');
const telegramHookRoutePath = `${config.get(
  'bot.serverEndpoint',
)}${webHookUrlPath}`;
const gitlabHookRoutePath = `${config.get('gitlab.serverEndpoint')}`;

const app = express();
const router = new express.Router();

app.use(express.json());
app.use(config.get('server.root'), router);

app.listen(port, async () => {
  try {
    const serverEndpointUrl =
      config.get('server.host') + config.get('server.root');

    const storage = await makePersistent('storage.json', new StorageService());

    const gitlab = new GitlabService(
      serverEndpointUrl + gitlabHookRoutePath,
      config.get('gitlab'),
    );
    const telegram = new TelegramService(
      config.get('bot.token'),
      !config.get('bot.serverEndpoint')
        ? false
        : serverEndpointUrl + telegramHookRoutePath,
      gitlab,
      storage,
    );

    router.post(gitlabHookRoutePath, async (req, res) => {
      await telegram.onGitlabEvents(req.body);
      res.sendStatus(200);
    });

    router.post(telegramHookRoutePath, (req, res) => {
      telegram.bot.processUpdate(req.body);
      res.sendStatus(200);
    });

    console.log(`App listening on port ${port}`);
  } catch (e) {
    console.error(e);
  }
});
