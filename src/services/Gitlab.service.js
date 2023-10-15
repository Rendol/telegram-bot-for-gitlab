import {Gitlab} from '@gitbeaker/rest';

export class GitlabService {
  /**
   * @param webhookUrl {string}
   * @param opts {{host:string, token:string}}
   */
  constructor(webhookUrl, opts) {
    this.webhookUrl = webhookUrl;
    this.host = opts.host;
    this.token = opts.token;
    this.gitlab = new Gitlab(opts);
  }

  async getProjectByUrl(projectUrl) {
    const url = new URL(projectUrl);
    const projectName = url.pathname.slice(1);
    const project = await fetch(
      `${this.host}/api/v4/projects/${encodeURIComponent(projectName)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'PRIVATE-TOKEN': this.token,
        },
      },
    ).then(res => res.json());
    if (!project.id) {
      throw project;
    }
    return project;
  }

  async addWebhook(projectUrl) {
    const project = await this.getProjectByUrl(projectUrl);
    const webhooks = await this.gitlab.ProjectHooks.all(project.id);
    const found = webhooks.find(x => x.url === this.webhookUrl);
    if (found) {
      return found;
    }
    return await this.gitlab.ProjectHooks.add(project.id, this.webhookUrl, {
      enableSslVerification: false,
      pushEvents: true,
      pushEventsBranchFilter: '*',
      mergeRequestsEvents: true,
      pipelineEvents: true,
      issuesEvents: true,
      noteEvents: true,
    });
  }

  async delWebhook(projectUrl) {
    const project = await this.getProjectByUrl(projectUrl);
    const webhooks = await this.gitlab.ProjectHooks.all(project.id);
    const found = webhooks.find(x => x.url === this.webhookUrl);
    if (!found) {
      return true;
    }
    return await this.gitlab.ProjectHooks.remove(project.id, found.id);
  }
}
