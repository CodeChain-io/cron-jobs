import { IncomingWebhook, MessageAttachment } from "@slack/client";
import * as _ from "lodash";
import { getConfig, haveConfig } from "./util";

const slackWebhookUrl = haveConfig("SLACK_WEBHOOK_URL") ? getConfig("SLACK_WEBHOOK_URL") : "";

export class SlackNotification {
    // tslint:disable-next-line:variable-name
    private static _instance: SlackNotification;
    private webhook?: IncomingWebhook;
    private unsentMessage: MessageAttachment[] = [];

    private readonly sendDebounced: any;

    private constructor() {
        if (slackWebhookUrl === "") {
            return;
        }

        this.webhook = new IncomingWebhook(slackWebhookUrl, {});
        this.sendDebounced = _.debounce(() => {
            this.sendInternal();
        }, 1500);
    }

    public static get instance() {
        return this._instance || (this._instance = new this());
    }

    public send(msg: MessageAttachment) {
        if (slackWebhookUrl === "") {
            return;
        }

        this.unsentMessage.push(msg);
        this.sendDebounced();
    }

    private sendInternal() {
        this.webhook!.send(
            {
                attachments: this.unsentMessage,
            },
            (err: Error) => {
                if (err) {
                    console.error("IncomingWebhook failed!", err);
                    return;
                }
            },
        );
        this.unsentMessage = [];
    }
}
