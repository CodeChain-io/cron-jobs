import { getConfig, delay, haveConfig } from "./util";
import * as Notifications from "./Notification";
import { SlackNotification } from "./SlackNotify";
import { EmailClient } from "./EmailNotify";
import { SDK } from "codechain-sdk";

const emailClient = new EmailClient();
type Notification = Notifications.Notification;

function colorFromLevel(level: "error" | "warn" | "info"): "danger" | "warning" | undefined {
    switch (level) {
        case "error":
            return "danger";
        case "warn":
            return "warning";
        default:
            return undefined;
    }
}

function sendNotice(error: Notification, targetEmail: string): Promise<void> {
    const color = colorFromLevel(error.level);

    if (color != null) {
        SlackNotification.instance.send({
            title: error.title,
            text: error.content,
            color,
        });
    }
    return emailClient
        .sendAnnouncement(targetEmail, error.title, error.content)
        .catch(console.error);
}

// Print current stauts in console every 10 minutes.
// Send current status to email every hour.
class StatePrinter {
    private targetEmail: string;
    private logarithmPrinterSeconds: number;
    private logarithmPrintedTime: Date;
    private lastPrintedTime: Date;
    private lastEmailSentTime: Date;
    public constructor(targetEmail: string) {
        this.targetEmail = targetEmail;
        this.logarithmPrinterSeconds = 1;
        this.logarithmPrintedTime = new Date();
        this.lastPrintedTime = new Date();
        this.lastEmailSentTime = new Date();
    }

    public async feed(checkedBlockNumber: number) {
        const now = new Date();

        if (
            now.getTime() - this.logarithmPrintedTime.getTime() >
            this.logarithmPrinterSeconds * 1000
        ) {
            this.logarithmPrinterSeconds *= 2;
            this.logarithmPrintedTime = now;
            console.log(`Checked ${checkedBlockNumber} at ${now.toISOString()}`);
        }

        if (now.getTime() - this.lastPrintedTime.getTime() > 10 * 60 * 1000) {
            this.lastPrintedTime = now;
            console.log(`Checked ${checkedBlockNumber} at ${now.toISOString()}`);
        }
        if (now.getTime() - this.lastEmailSentTime.getTime() > 60 * 60 * 1000) {
            this.lastEmailSentTime = now;
            await sendNotice(new Notifications.Working(checkedBlockNumber), this.targetEmail);
        }
    }
}

function checkExist(environmentVariableName: string) {
    if (!haveConfig(environmentVariableName)) {
        console.log(`Please set the ${environmentVariableName} environment variable`);
        process.exit(1);
    }
}

async function main() {
    checkExist("CODECHAIN_RPC_URL");
    checkExist("NOTIFICATION_TARGET_EMAIL");
    checkExist("SENDGRID_API_KEY");

    const codeChainRPCURL = getConfig("CODECHAIN_RPC_URL");
    const sdk = new SDK({
        server: codeChainRPCURL,
    });
    const targetEmail = getConfig("NOTIFICATION_TARGET_EMAIL");
    const statePrinter = new StatePrinter(targetEmail);

    try {
        const currentBestBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
        console.log(`Start with best block number ${currentBestBlockNumber}`);
        const networkID = await sdk.rpc.chain.getNetworkId();
        sendNotice(new Notifications.Started(currentBestBlockNumber, networkID), targetEmail);
    } catch (err) {
        console.error(`Failed to connect ${codeChainRPCURL}`);
        throw err;
    }

    let currentBlockNumber = 1;
    let prevBlock = (await sdk.rpc.chain.getBlock(currentBlockNumber - 1))!;
    while (true) {
        const currentBlock = (await sdk.rpc.chain.getBlock(currentBlockNumber))!;
        if (currentBlock === null) {
            break;
        }
        if (prevBlock.timestamp === currentBlock.timestamp) {
            await sendNotice(
                new Notifications.TheSameBlockFound(
                    prevBlock.number,
                    currentBlock.number,
                    prevBlock.timestamp,
                ),
                targetEmail,
            );
            await delay(1000);
        }
        if (prevBlock.timestamp > currentBlock.timestamp) {
            const lines = [
                "Prev block has larger timestamp",
                "PrevBlock:",
                `  number: ${prevBlock.number}`,
                `  timestamp: ${prevBlock.timestamp}`,
                "NextBlock:",
                `  number: ${currentBlock.number}`,
                `  timestamp: ${currentBlock.timestamp}`,
            ];
            await sendNotice(new Notifications.Unexpected(lines.join("\n\n")), targetEmail);
            await delay(1000);
        }
        await statePrinter.feed(currentBlockNumber);
        currentBlockNumber += 1;
        prevBlock = currentBlock;
    }

    await sendNotice(new Notifications.Finished(currentBlockNumber - 1), targetEmail);
}

main().catch(async (error: any) => {
    console.error(error);
    const targetEmail = getConfig("NOTIFICATION_TARGET_EMAIL");
    await sendNotice(new Notifications.Unexpected(String(error)), targetEmail);
    process.exit(1);
});
