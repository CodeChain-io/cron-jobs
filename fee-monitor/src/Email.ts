import * as sendgrid from "@sendgrid/mail";

export interface Email {
    sendError(msg: string): void;
    sendWarning(text: string): void;
    sendInfo(title: string, msg: string): void;
}

class NullEmail implements Email {
    public sendError(_msg: string): void {}
    public sendWarning(_text: string): void {}
    public sendInfo(_title: string, _msg: string): void {}
}

const from = "no-reply+fee-monitor@devop.codechain.io";

class Sendgrid implements Email {
    private readonly tag: string;
    private readonly to: string;

    public constructor(params: { tag: string; sendgridApiKey: string; to: string }) {
        const { tag, sendgridApiKey, to } = params;
        this.tag = tag;
        sendgrid.setApiKey(sendgridApiKey);
        this.to = to;
    }

    public sendError(text: string): void {
        const subject = `[error]${this.tag} has a problem. - ${new Date().toISOString()}`;
        this.send(subject, text);
    }

    public sendWarning(text: string): void {
        const subject = `[error]${this.tag} finds a problem. - ${new Date().toISOString()}`;
        this.send(subject, text);
    }

    public sendInfo(title: string, text: string): void {
        const subject = `[error]${this.tag} ${title} - ${new Date().toISOString()}`;
        this.send(subject, text);
    }

    private send(subject: string, value: string): void {
        sendgrid
            .send({ subject, from, to: this.to, content: [{ type: "text/html", value }] })
            .catch(console.error);
    }
}

export function createEmail(params: { tag: string; to?: string; sendgridApiKey?: string }): Email {
    const { tag, to, sendgridApiKey } = params;
    if (sendgridApiKey != null) {
        if (to == null) {
            throw Error("The email destination is not set");
        }
        console.log("Sendgrid key is set");
        return new Sendgrid({ tag, sendgridApiKey, to });
    } else {
        console.log("Donot use sendgrid");
        return new NullEmail();
    }
}
