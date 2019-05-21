import { getConfig } from "./util";
import * as Notifications from "./Notification";
import { SlackNotification } from "./SlackNotify";
import { EmailClient } from "./EmailNotify";
import { IndexerAPI } from "./IndexerAPI";

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

function sendNotice(error: Notification, targetEmail: string) {
    const color = colorFromLevel(error.level);
    if (color != null) {
        SlackNotification.instance.send({
            title: error.title,
            text: error.content,
            color,
        });
    }
    emailClient
        .sendAnnouncement(
            targetEmail,
            `${error.title} - ${error.date.toISOString()}`,
            error.content,
        )
        .catch(console.error);
}

const checkDayChange = (() => {
    let lastDate = new Date().getUTCDate();
    let firstBlockNumberOfLastData = 0;
    let lastBlockNumberOfLastDate = 0;

    return async (api: IndexerAPI, targetEmail: string) => {
        const now = new Date();
        const nowDate = now.getUTCDate();
        let currentBlockNumber = lastBlockNumberOfLastDate;
        try {
            const { indexerBestBlockNumber } = await api.syncStatus();
            currentBlockNumber = indexerBestBlockNumber;
        } catch (err) {
            console.error(err);
        }

        if (lastDate === nowDate) {
            lastBlockNumberOfLastDate = currentBlockNumber;
            return;
        }

        sendNotice(
            new Notifications.DailyReport(firstBlockNumberOfLastData, lastBlockNumberOfLastDate),
            targetEmail,
        );
        lastDate = nowDate;
        firstBlockNumberOfLastData = currentBlockNumber;
        lastBlockNumberOfLastDate = currentBlockNumber;
    };
})();

const checkPing = (() => {
    let isIndexerHealthy = true;
    return async (api: IndexerAPI, targetEmail: string) => {
        try {
            await api.ping();
            if (!isIndexerHealthy) {
                isIndexerHealthy = true;
                sendNotice(new Notifications.IndexerPingSuccess(), targetEmail);
            }
        } catch (err) {
            if (!isIndexerHealthy) {
                return;
            }

            isIndexerHealthy = false;
            console.error(err);
            sendNotice(new Notifications.IndexerPingFailed(), targetEmail);
        }
    };
})();

const checkFollowUp = (() => {
    let indexerWasSlow: "slow" | "following" | null = null;

    return async (api: IndexerAPI, targetEmail: string) => {
        try {
            const status = await api.syncStatus();

            const indexerIsSlow =
                status.codechainBestBlockNumber > status.indexerBestBlockNumber + 50;

            if (indexerWasSlow === null && indexerIsSlow) {
                indexerWasSlow = "slow";
                sendNotice(
                    new Notifications.IndexerSyncTooSlow(
                        status.indexerBestBlockNumber,
                        status.codechainBestBlockNumber,
                    ),
                    targetEmail,
                );
                return;
            }

            if (indexerWasSlow === null && !indexerIsSlow) {
                indexerWasSlow = "following";
                console.log(
                    `Indexer is syncing well. Currnet indexed block number: ${
                        status.indexerBestBlockNumber
                    }, best block number: ${status.codechainBestBlockNumber}`,
                );
                return;
            }

            if (indexerWasSlow === "following" && indexerIsSlow) {
                indexerWasSlow = "slow";
                sendNotice(
                    new Notifications.IndexerSyncTooSlow(
                        status.indexerBestBlockNumber,
                        status.codechainBestBlockNumber,
                    ),
                    targetEmail,
                );
                return;
            }

            if (indexerWasSlow === "slow" && !indexerIsSlow) {
                indexerWasSlow = "following";
                sendNotice(
                    new Notifications.IndexerSyncNormalized(
                        status.indexerBestBlockNumber,
                        status.codechainBestBlockNumber,
                    ),
                    targetEmail,
                );
                return;
            }
        } catch (err) {
            console.error(err);
            // If the indexer is not responding, the checkPing will send an error message.
        }
    };
})();

const checkBlockSync = (() => {
    let prevBlockNumber: number | null = null;
    let prevStatus: "NotSyncing" | "Syncing" | null = null;
    return async (api: IndexerAPI, targetEmail: string) => {
        try {
            const status = await api.syncStatus();
            const bestBlockNumber = status.codechainBestBlockNumber;

            const syncStopped = prevBlockNumber === bestBlockNumber;
            prevBlockNumber = bestBlockNumber;

            if (syncStopped && prevStatus === "NotSyncing") {
                prevStatus = "NotSyncing";
                return;
            }

            if (syncStopped && prevStatus === "Syncing") {
                prevStatus = "NotSyncing";
                sendNotice(
                    new Notifications.IndexerCodeChainNotSyncing(status.codechainBestBlockNumber),
                    targetEmail,
                );
                return;
            }

            if (syncStopped && prevStatus === null) {
                prevStatus = "NotSyncing";
                return;
            }

            if (!syncStopped && prevStatus === "NotSyncing") {
                prevStatus = "Syncing";
                sendNotice(
                    new Notifications.IndexerCodeChainSyncing(status.codechainBestBlockNumber),
                    targetEmail,
                );
                return;
            }

            if (!syncStopped && prevStatus === null) {
                prevStatus = "Syncing";
                return;
            }
        } catch (err) {
            console.error(err);
            // If the indexer is not responding, the checkPing will send an error message.
        }
    };
})();

async function main() {
    const indexerUrl = getConfig<string>("indexer_url");
    const indexerAPI = new IndexerAPI(indexerUrl);
    const targetEmail = getConfig<string>("notification_target_email");

    try {
        await indexerAPI.ping();
    } catch (err) {
        console.error("Indexer should be accessible when starting the watcher");
        console.error(err);
        process.exit(1);
    }

    // 10 minutes interval
    setInterval(checkDayChange, 10 * 60 * 1000, targetEmail);

    setInterval(checkPing, 5 * 1000, indexerAPI, targetEmail);
    setInterval(checkFollowUp, 10 * 1000, indexerAPI, targetEmail);
    setInterval(checkBlockSync, 5 * 60 * 1000, indexerAPI, targetEmail);
}

main().catch(error => {
    console.error(error);
    throw error;
});
