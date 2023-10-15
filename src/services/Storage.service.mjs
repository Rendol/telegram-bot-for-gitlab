/**
 * Storage for saving link gitlab projects to telegram chat
 */
export class StorageService {
  constructor() {
    this.chats = {};
    this.users = [];
    this.ownerUserId = 0;
  }

  setOwnerUserId(userId) {
    this.ownerUserId = userId;
    this.users = [this.ownerUserId];
  }

  checkAccess(userId) {
    if (!this.users.includes(userId)) {
      throw new Error('Permission denied');
    }
  }

  addUser(initiatorId, targetId) {
    this.checkAccess(initiatorId);
    if (isNaN(+targetId)) {
      throw new Error(`UserId not valid: ${+targetId} <- ${targetId}`);
    }
    this.users = Array.from(new Set(this.users.concat(+targetId)).values());
  }

  delUser(initiatorId, targetId) {
    this.checkAccess(+targetId === +this.ownerUserId ? null : initiatorId);
    this.users = this.users.filter(id => id !== targetId);
  }

  getChats(projectUrl) {
    return Object.entries(this.chats)
      .filter(([chatId, urls]) => urls.includes(projectUrl))
      .map(([chatId]) => chatId);
  }

  getProjects(chatId) {
    return this.chats[chatId] || [];
  }

  setProjects(userId, chatId, urls) {
    this.checkAccess(userId);
    if (!Array.isArray(this.chats[chatId])) {
      this.chats[chatId] = [];
    }
    this.chats[chatId] = urls;
  }

  addProject(userId, chatId, projectUrl) {
    this.setProjects(
      userId,
      chatId,
      Array.from(new Set(this.getProjects(chatId).concat(projectUrl)).values()),
    );
  }

  delProject(userId, chatId, projectUrl) {
    this.setProjects(
      userId,
      chatId,
      this.getProjects(chatId).filter(url => url !== projectUrl),
    );
    const projectsCountByChatId = this.getProjects(chatId).length;
    if (projectsCountByChatId === 0) {
      delete this.chats[chatId];
    }
    const chatCountByProjectUrl = this.getChats(projectUrl).length;
    return {projectsCountByChatId, chatCountByProjectUrl};
  }
}
