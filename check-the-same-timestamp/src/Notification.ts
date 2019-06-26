export interface Notification {
    readonly title: string;
    readonly content: string;
    readonly level: "error" | "warn" | "info";
    readonly date: Date;
}

const PREFIX = `[check-the-same-timestamp]`;
const TITLE = `${PREFIX} Status`;

export class Started implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "info";
    public readonly date = new Date();

    public constructor(
        currentBestBlockNumber: number,
        networkId: string,
        startBlockNumber: number,
    ) {
        this.title = TITLE;
        const lines = [
            "Check started",
            `The current best block number: ${currentBestBlockNumber}`,
            `The network ID: ${networkId}`,
            `From block number: ${startBlockNumber}`,
        ];
        // Sendgrid use the MKDoc-Text-Structured
        // https://metacpan.org/pod/release/BPOSTLE/MKDoc-Text-Structured-0.83/lib/MKDoc/Text/Structured.pm
        this.content = lines.join("\n\n");
    }
}

export class Working implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "info";
    public readonly date = new Date();

    public constructor(currentBlockNumber: number) {
        this.title = TITLE;
        this.content = `Check blocks until ${currentBlockNumber}`;
    }
}

export class TheSameBlockFound implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "error";
    public readonly date = new Date();

    public constructor(blockNumberA: number, blockNumberB: number, timestamp: number) {
        const prefix = `[check-the-same-timestamp]`;
        this.title = `${prefix} Status`;
        const lines = [
            "There are blocks whose timestamp is the same",
            `blockNumberA: ${blockNumberA}`,
            `blockNumberB: ${blockNumberB}`,
            `timestamp: ${timestamp}`,
        ];
        this.content = lines.join("\n\n");
    }
}

export class Finished implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "info";
    public readonly date = new Date();

    public constructor(lastBlockNumber: number) {
        this.title = TITLE;
        const lines = ["Check finished", `Last checked block number is ${lastBlockNumber}`];
        this.content = lines.join("\n\n");
    }
}

export class Unexpected implements Notification {
    public readonly title: string;
    public readonly content: string;
    public readonly level = "error";
    public readonly date = new Date();

    public constructor(errorMsg: string) {
        this.title = TITLE;
        const lines = ["Unexpected error", errorMsg];
        this.content = lines.join("\n\n");
    }
}
