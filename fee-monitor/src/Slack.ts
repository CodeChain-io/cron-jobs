import * as _ from "lodash";

const { IncomingWebhook } = require("@slack/client");

interface Attachment {
    title: string;
    text: string;
}

export interface Slack {
    sendMessage(msg: string): void;
    sendError(msg: string): void;
    sendAttachments(title: string, text: string): void;
}

class NullSlack implements Slack {
    public sendMessage(_msg: string) {}
    public sendError(_msg: string) {}
    public sendAttachments(_title: string, _text: string) {}
}

class SlackWebhook implements Slack {
    private tag: string;
    private webhook: any;
    private unsentMessage: string[] = [];
    private unsentAttachments: Attachment[] = [];

    private sendDebounced: any;

    public constructor(tag: string, slackWebhookUrl: string) {
        this.tag = tag;
        this.webhook = new IncomingWebhook(slackWebhookUrl, {});
        this.sendDebounced = _.debounce(() => {
            this.send();
        }, 1500);
    }

    public sendMessage(msg: string) {
        msg = `"${this.tag}" ${msg}`;
        this.unsentMessage.push(msg);
        this.sendDebounced();
    }

    public sendError(msg: string) {
        msg = `"${this.tag}" ${msg}`;
        this.unsentMessage.push(msg);
        this.sendDebounced();
    }

    public sendAttachments(title: string, text: string) {
        console.log(`Attachment: ${title}`);
        this.unsentAttachments.push({ title, text });
        this.sendDebounced();
    }

    private send() {
        this.webhook.send(
            {
                text: _.join(this.unsentMessage, "\n"),
                attachments: this.unsentAttachments,
            },
            (err: Error) => {
                if (err) {
                    console.error("IncomingWebhook failed!", err);
                    return;
                }
            },
        );
        this.unsentMessage = [];
        this.unsentAttachments = [];
    }
}

export function createSlack(tag: string, slackWebhookUrl: string | undefined): Slack {
    if (slackWebhookUrl) {
        console.log("Slack connected");
        return new SlackWebhook(tag, slackWebhookUrl);
    } else {
        console.log("Slack not connected");
        return new NullSlack();
    }
}
