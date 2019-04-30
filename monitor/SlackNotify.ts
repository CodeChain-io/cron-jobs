import * as _ from "lodash";
import { getConfig } from "./util";

const { IncomingWebhook } = require("@slack/client");

const slackWebhookUrl = getConfig<string>("slack_webhook_url");

interface Attachment {
  title: string;
  text: string;
}

export class SlackNotification {
  // tslint:disable-next-line:variable-name
  private static _instance: SlackNotification;
  private webhook: any;
  private unsentMessage: string[] = [];
  private unsentAttachments: Attachment[] = [];

  private readonly sendDebounced: any;

  private constructor() {
    if (slackWebhookUrl === "") {
      return;
    }

    this.webhook = new IncomingWebhook(slackWebhookUrl, {});
    this.sendDebounced = _.debounce(() => {
      this.send();
    }, 1500);
  }

  public static get instance() {
    return this._instance || (this._instance = new this());
  }

  public sendError(msg: string) {
    if (slackWebhookUrl === "") {
      return;
    }

    msg = `${msg}`;
    this.unsentMessage.push(msg);
    this.sendDebounced();
  }

  private send() {
    this.webhook.send(
      {
        text: _.join(this.unsentMessage, "\n"),
        attachments: this.unsentAttachments
      },
      (err: Error) => {
        if (err) {
          console.error("IncomingWebhook failed!", err);
          return;
        }
      }
    );
    this.unsentMessage = [];
    this.unsentAttachments = [];
  }
}
