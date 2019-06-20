import { IncomingWebhook, MessageAttachment } from "@slack/client";
import * as _ from "lodash";

export interface Slack {
    sendError(msg: string): void;
    sendWarning(text: string): void;
    sendInfo(title: string, text: string): void;
}

class NullSlack implements Slack {
    public sendError(_msg: string) {}
    public sendWarning(_text: string) {}
    public sendInfo(_title: string, _text: string) {}
}

class SlackWebhook implements Slack {
    private readonly tag: string;
    private readonly webhook: IncomingWebhook;
    private unsentAttachments: MessageAttachment[] = [];

    private readonly sendDebounced: any;

    public constructor(tag: string, slackWebhookUrl: string) {
        this.tag = tag;
        this.webhook = new IncomingWebhook(slackWebhookUrl, {});
        this.sendDebounced = _.debounce(() => {
            this.send();
        }, 1500);
    }

    public sendError(text: string) {
        const title = `[error]${this.tag} has a problem`;
        this.unsentAttachments.push({ title, text, color: "danger" });
        this.sendDebounced();
    }

    public sendWarning(text: string) {
        console.log(`Warning: ${text}`);
        this.unsentAttachments.push({
            title: `[warn]${this.tag} finds a problem`,
            text,
            color: "warning",
        });
        this.sendDebounced();
    }

    public sendInfo(title: string, text: string) {
        console.log(`Info: ${text}`);
        this.unsentAttachments.push({
            title: `[info]${this.tag} ${title}`,
            text,
            color: "good",
        });
        this.sendDebounced();
    }

    private send() {
        this.webhook.send({
            attachments: this.unsentAttachments,
        });
        this.unsentAttachments = [];
    }
}

export function createSlack(tag: string, slackWebhookUrl: string | undefined): Slack {
    if (slackWebhookUrl != null) {
        console.log("Slack connected");
        return new SlackWebhook(tag, slackWebhookUrl);
    } else {
        console.log("Slack not connected");
        return new NullSlack();
    }
}
