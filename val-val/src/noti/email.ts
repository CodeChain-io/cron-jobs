import * as sendgrid from "@sendgrid/mail";

export interface Email {
    sendError(msg: string): void;
}

class NullEmail implements Email {
    public sendError(msg: string): void {
        console.error("Error:", msg);
    }
}

const from = "no-reply+val-val@devop.codechain.io";

function createTitle(params: { title: string; tag: string; level: string }): string {
    const { title, tag, level } = params;
    return `[${level}]${tag} ${title} - ${new Date().toISOString()}`;
}

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
        const subject = createTitle({ tag: this.tag, title: "has a problem.", level: "error" });
        this.send(subject, text);
    }

    public sendWarning(text: string): void {
        const subject = createTitle({ tag: this.tag, title: "finds a problem.", level: "warn" });
        this.send(subject, text);
    }

    public sendInfo(title: string, text: string): void {
        const subject = createTitle({ tag: this.tag, title, level: "info" });
        this.send(subject, text);
    }

    private send(subject: string, value: string): void {
        sendgrid
            .send({ subject, from, to: this.to, content: [{ type: "text/html", value }] })
            .catch(console.error);
    }
}

export default function createEmail(params: { tag: string; to?: string; sendgridApiKey?: string }): Email {
    const { tag, to, sendgridApiKey } = params;
    if (sendgridApiKey != null) {
        if (to == null) {
            throw Error("The email destination is not set");
        }
        console.log("Sendgrid key is set");
        return new Sendgrid({ tag, sendgridApiKey, to });
    } else {
        console.log("Do not use sendgrid");
        return new NullEmail();
    }
}

