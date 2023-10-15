import {Gitlab} from '@gitbeaker/rest';

export class GitlabService {
  /**
   * @param webhookUrl {string}
   * @param opts {{host:string, tokens: {[group: string]: string}}}
   */
  constructor(webhookUrl, opts) {
    this.webhookUrl = webhookUrl;
    this.host = opts.host;
    this.tokens = opts.tokens;
    this.gitlab = new Gitlab(opts);
  }

  get(projectUrl) {
    const url = new URL(projectUrl);
    const projectName = url.pathname.slice(1);
    const groupName = projectName.split('/').shift();
    const token = this.tokens[groupName];
    return {
      name: projectName,
      token,
      gitlab: new Gitlab({
        host: this.host,
        token,
      }),
    };
  }

  async getProjectByUrl(projectUrl) {
    const {gitlab, token, name} = this.get(projectUrl);
    const project = await fetch(
      `${this.host}/api/v4/projects/${encodeURIComponent(name)}`,
      {
        headers: {
          'Content-Type': 'application/json',
          'PRIVATE-TOKEN': token,
        },
      },
    ).then(res => res.json());
    if (!project.id) {
      throw project;
    }
    return {gitlab, project};
  }

  async addWebhook(projectUrl) {
    const {gitlab, project} = await this.getProjectByUrl(projectUrl);
    const webhooks = await gitlab.ProjectHooks.all(project.id);
    const found = webhooks.find(x => x.url === this.webhookUrl);
    if (found) {
      return found;
    }
    return await gitlab.ProjectHooks.add(project.id, this.webhookUrl, {
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
    const {gitlab, project} = await this.getProjectByUrl(projectUrl);
    const webhooks = await gitlab.ProjectHooks.all(project.id);
    const found = webhooks.find(x => x.url === this.webhookUrl);
    if (!found) {
      return true;
    }
    return await gitlab.ProjectHooks.remove(project.id, found.id);
  }
}
