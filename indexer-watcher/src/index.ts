import { getConfig } from "./util";
import * as Notifications from "./Notification";
import { SlackNotification } from "./SlackNotify";
import { EmailClient } from "./EmailNotify";
import { IndexerAPI, IndexerAPIImpl, TestIndexerAPI } from "./IndexerAPI";

const emailClient = new EmailClient();
type Notification = Notifications.Notification;
let lastNotiForTest: Notification | null = null;

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

    if (process.env.NODE_ENV === "test") {
        lastNotiForTest = error;
        return;
    }

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
    let firstBlockNumberOfLastData: "unknown" | number = "unknown";
    let lastBlockNumberOfLastDate = 0;

    return async (api: IndexerAPI, targetEmail: string) => {
        const now = new Date();
        const nowDate = now.getUTCDate();
        let currentBlockNumber = lastBlockNumberOfLastDate;
        try {
            const { indexedBlockNumber } = await api.syncStatus();
            currentBlockNumber = indexedBlockNumber;
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

            const indexerIsSlow = status.codechainBestBlockNumber > status.indexedBlockNumber + 50;

            if (indexerWasSlow === null && indexerIsSlow) {
                indexerWasSlow = "slow";
                sendNotice(
                    new Notifications.IndexerSyncTooSlow(
                        status.indexedBlockNumber,
                        status.codechainBestBlockNumber,
                    ),
                    targetEmail,
                );
                return;
            }

            if (indexerWasSlow === null && !indexerIsSlow) {
                indexerWasSlow = "following";
                console.log(
                    `Indexer is syncing well. Current indexed block number: ${status.indexedBlockNumber}, best block number: ${status.codechainBestBlockNumber}`,
                );
                return;
            }

            if (indexerWasSlow === "following" && indexerIsSlow) {
                indexerWasSlow = "slow";
                sendNotice(
                    new Notifications.IndexerSyncTooSlow(
                        status.indexedBlockNumber,
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
                        status.indexedBlockNumber,
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

async function pingTests(assert: any, indexerAPI: TestIndexerAPI, dummyEmail: string) {
    indexerAPI.pingError = null;
    await assert.isFulfilled(checkPing(indexerAPI, dummyEmail));
    assert.isNull(lastNotiForTest, "Do not send noti when the first ping succeed");
    lastNotiForTest = null;

    indexerAPI.pingError = new Error("Test error");
    await assert.isFulfilled(checkPing(indexerAPI, dummyEmail));
    assert.isNotNull(lastNotiForTest);
    assert.instanceOf(
        lastNotiForTest,
        Notifications.IndexerPingFailed,
        "Send noti when the ping failed",
    );
    lastNotiForTest = null;

    indexerAPI.pingError = null;
    await assert.isFulfilled(checkPing(indexerAPI, dummyEmail));
    assert.instanceOf(
        lastNotiForTest,
        Notifications.IndexerPingSuccess,
        "Send noti when the indexer became normal",
    );
    lastNotiForTest = null;

    indexerAPI.pingError = null;
    await assert.isFulfilled(checkPing(indexerAPI, dummyEmail));
    assert.isNull(lastNotiForTest, "Do not send noti if indexer is normal and was normal.");
    lastNotiForTest = null;
}

async function followupTest(assert: any, indexerAPI: TestIndexerAPI, dummyEmail: string) {
    indexerAPI.syncStatusResult.codechainBestBlockNumber = 100;
    indexerAPI.syncStatusResult.indexedBlockNumber = 100;

    lastNotiForTest = null;
    await assert.isFulfilled(checkFollowUp(indexerAPI, dummyEmail));
    assert.isNull(lastNotiForTest, "Do not send noti if the indexer is following");

    lastNotiForTest = null;
    indexerAPI.syncStatusResult.codechainBestBlockNumber = 150;
    indexerAPI.syncStatusResult.indexedBlockNumber = 100;
    await assert.isFulfilled(checkFollowUp(indexerAPI, dummyEmail));
    assert.isNull(lastNotiForTest, "Do not send noti if the difference is 50");

    lastNotiForTest = null;
    indexerAPI.syncStatusResult.codechainBestBlockNumber = 151;
    indexerAPI.syncStatusResult.indexedBlockNumber = 100;
    await assert.isFulfilled(checkFollowUp(indexerAPI, dummyEmail));
    assert.instanceOf(
        lastNotiForTest,
        Notifications.IndexerSyncTooSlow,
        "Send noti when the difference >= 51",
    );

    lastNotiForTest = null;
    indexerAPI.syncStatusResult.codechainBestBlockNumber = 200;
    indexerAPI.syncStatusResult.indexedBlockNumber = 110;
    await assert.isFulfilled(checkFollowUp(indexerAPI, dummyEmail));
    assert.isNull(lastNotiForTest, "Do not send noti when the indexer was slow and is slow");

    lastNotiForTest = null;
    indexerAPI.syncStatusResult.codechainBestBlockNumber = 200;
    indexerAPI.syncStatusResult.indexedBlockNumber = 190;
    await assert.isFulfilled(checkFollowUp(indexerAPI, dummyEmail));
    assert.instanceOf(
        lastNotiForTest,
        Notifications.IndexerSyncNormalized,
        "Send noti when the indexer became normal",
    );

    lastNotiForTest = null;
    indexerAPI.syncStatusResult.codechainBestBlockNumber = 200;
    indexerAPI.syncStatusResult.indexedBlockNumber = 199;
    await assert.isFulfilled(checkFollowUp(indexerAPI, dummyEmail));
    assert.isNull(lastNotiForTest, "Do not send noti when the indexer is normal and was normal");
}

async function blockSyncTest(assert: any, indexerAPI: TestIndexerAPI, dummyEmail: string) {
    indexerAPI.syncStatusResult.codechainBestBlockNumber = 100;

    lastNotiForTest = null;
    await assert.isFulfilled(checkBlockSync(indexerAPI, dummyEmail));
    assert.isNull(lastNotiForTest, "Do not send noti in the first check");

    lastNotiForTest = null;
    await assert.isFulfilled(checkBlockSync(indexerAPI, dummyEmail));
    assert.instanceOf(
        lastNotiForTest,
        Notifications.IndexerCodeChainNotSyncing,
        "Send noti when the best block number is not changed",
    );

    lastNotiForTest = null;
    await assert.isFulfilled(checkBlockSync(indexerAPI, dummyEmail));
    assert.isNull(lastNotiForTest, "Do not send noti when the error state is not changed");

    lastNotiForTest = null;
    indexerAPI.syncStatusResult.codechainBestBlockNumber = 101;
    await assert.isFulfilled(checkBlockSync(indexerAPI, dummyEmail));
    assert.instanceOf(
        lastNotiForTest,
        Notifications.IndexerCodeChainSyncing,
        "Send noti when the indexer's CodeChain became normal",
    );

    lastNotiForTest = null;
    indexerAPI.syncStatusResult.codechainBestBlockNumber = 102;
    await assert.isFulfilled(checkBlockSync(indexerAPI, dummyEmail));
    assert.isNull(
        lastNotiForTest,
        "Do not send noti when the indexer's CodeChain is normal and was normal",
    );
}

async function runTests() {
    try {
        const indexerAPI = new TestIndexerAPI();
        const dummyEmail = "dummy mail";
        const chai = require("chai");
        const chaiAsPromised = require("chai-as-promised");
        chai.use(chaiAsPromised);
        const assert = chai.assert;

        await pingTests(assert, indexerAPI, dummyEmail);
        await followupTest(assert, indexerAPI, dummyEmail);
        await blockSyncTest(assert, indexerAPI, dummyEmail);

        console.log("TEST SUCCESS");
    } catch (err) {
        console.log("TEST FAILED");
        throw err;
    }
}

async function main() {
    if (process.env.NODE_ENV === "test") {
        await runTests();
        return;
    }

    const indexerUrl = getConfig("INDEXER_URL");
    const indexerAPI = new IndexerAPIImpl(indexerUrl);
    const targetEmail = getConfig("NOTIFICATION_TARGET_EMAIL");

    try {
        await indexerAPI.ping();
    } catch (err) {
        console.error("Indexer should be accessible when starting the watcher");
        throw err;
    }

    // 10 minutes interval
    setInterval(checkDayChange, 10 * 60 * 1000, indexerAPI, targetEmail);

    setInterval(checkPing, 5 * 1000, indexerAPI, targetEmail);
    setInterval(checkFollowUp, 10 * 1000, indexerAPI, targetEmail);
    setInterval(checkBlockSync, 5 * 60 * 1000, indexerAPI, targetEmail);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
