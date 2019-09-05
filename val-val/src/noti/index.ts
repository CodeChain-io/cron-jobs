import createEmail, { Email } from "./email";
import createSlack, { Slack } from "./slack";

export default class Noti {
    private readonly email: Email;
    private readonly slack: Slack;

    constructor(params: { slackWebhookUrl?: string, to?: string; sendgridApiKey?: string}) {
        const { slackWebhookUrl, to, sendgridApiKey} = params;
        this.email = createEmail({tag: "[val-val]", to, sendgridApiKey});
        this.slack = createSlack("[val-val]", slackWebhookUrl);
    }

    public sendError(text: string) {
        this.email.sendError(text);
        this.slack.sendError(text);
    }

    public sendWarning(text: string) {
        this.slack.sendWarning(text);
    }

    public sendInfo(title: string, messages: string[]) {
        const slackMessage = messages.join("\n");
        this.slack.sendInfo(title, slackMessage);
    }
}
