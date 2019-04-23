#!/usr/bin/env node

import * as mail from "@sendgrid/mail";
import { U64 } from "codechain-primitives";
import { SDK } from "codechain-sdk";
import { get } from "config";

// FIXME: Cannot import with the below error message
//     node_modules/@slack/rtm-api/dist/RTMClient.d.ts:3:8 - error TS1192: Module '".../cron-jobs/juggle-ccc/node_modules/eventemitter3/index"' has no default export.
//     3 import EventEmitter from 'eventemitter3';
const { IncomingWebhook } = require("@slack/client");

function wait(timeout: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
}

function getConfig(field: string): string {
    const value = get<string>(field);
    if (value == null) {
        throw Error(`No ${field}`);
    }
    return value;
}

const defaultFee = 100;
const defaultQuantity = 100;

async function main() {
    const leftAddress = getConfig("left.address");
    const leftPassphrase = getConfig("left.passphrase");
    const rightAddress = getConfig("right.address");
    const rightPassphrase = getConfig("right.passphrase");
    const slackWebHook = get<string | null>("slack_webhook_url");
    const sendgridApiKey = get<string | null>("sendgrid.api_key");
    const sendgridTo = get<string | null>("sendgrid.to");
    if (sendgridApiKey != null) {
        if (sendgridTo == null) {
            throw Error("You must set sendgrid.to");
        }
    }

    const networkId = getConfig("network");
    const server = getConfig("server");

    const sdk = new SDK({ server, networkId });

    let isLeftTurn = true;

    let previousBlockNumber = await sdk.rpc.chain.getBestBlockNumber();

    let leftBalance = await sdk.rpc.chain.getBalance(
        leftAddress,
        previousBlockNumber
    );
    let rightBalance = await sdk.rpc.chain.getBalance(
        rightAddress,
        previousBlockNumber
    );

    if (leftBalance.isLessThan(500)) {
        if (rightBalance.isLessThan(500)) {
            throw Error(
                `Not enough balance to juggle. left: ${
                    leftBalance.value
                } right: ${rightBalance.value}`
            );
        }
        isLeftTurn = false;
    }

    let leftCount = 0;
    let rightCount = 0;
    let leftFee = 0;
    let rightFee = 0;
    if (sendgridApiKey != null) {
        let lastDailyReportSentDate = new Date().getUTCDate();
        setInterval(async () => {
            const now = new Date();
            const currentDate = now.getUTCDate();
            if (lastDailyReportSentDate === currentDate) {
                return;
            }

            try {
                const left = makeDailyReport(
                    "left",
                    leftAddress,
                    leftBalance,
                    leftCount,
                    leftFee
                );
                const right = makeDailyReport(
                    "right",
                    rightAddress,
                    rightBalance,
                    rightCount,
                    rightFee
                );
                leftCount = 0;
                rightCount = 0;
                leftFee = 0;
                rightFee = 0;
                await sendDailyReport(
                    sendgridApiKey,
                    sendgridTo!,
                    networkId,
                    now,
                    `${left}\r\n${right}\r\n`
                );

                lastDailyReportSentDate = currentDate;
            } catch (ex) {
                console.error(ex.message);
            }
        }, 60_000);
    }

    let retry = 0;
    while (true) {
        try {
            while (true) {
                const address = isLeftTurn ? leftAddress : rightAddress;
                const recipient = isLeftTurn ? rightAddress : leftAddress;
                const passphrase = isLeftTurn
                    ? leftPassphrase
                    : rightPassphrase;

                const currentBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
                if (currentBlockNumber <= previousBlockNumber) {
                    console.log("Wait 3 seconds");
                    await wait(3_000);
                    continue;
                }
                previousBlockNumber = currentBlockNumber;

                const seq = await sdk.rpc.chain.getSeq(
                    address,
                    currentBlockNumber
                );
                const currentBalance = await sdk.rpc.chain.getBalance(
                    address,
                    currentBlockNumber
                );
                if (isLeftTurn) {
                    leftBalance = currentBalance;
                } else {
                    rightBalance = currentBalance;
                }

                if (currentBalance.isLessThan(500)) {
                    const oppositeBalance = await sdk.rpc.chain.getBalance(
                        recipient,
                        currentBlockNumber
                    );
                    if (oppositeBalance.isLessThan(500)) {
                        const left = isLeftTurn
                            ? currentBalance
                            : oppositeBalance;
                        const right = isLeftTurn
                            ? oppositeBalance
                            : currentBalance;
                        throw Error(
                            `Too small balance on both address.\r\n ${leftAddress}: ${
                                left.value
                            }\r\n ${rightAddress}: ${right.value}`
                        );
                    }
                    isLeftTurn = !isLeftTurn;
                    continue;
                }

                const fee = Math.max(
                    Math.floor(Math.random() * 3 * defaultFee),
                    defaultFee
                );
                const quantity = Math.floor(
                    Math.random() * 10 * defaultQuantity
                );

                const tx = sdk.core.createPayTransaction({
                    recipient,
                    quantity
                });
                const signed = await sdk.key.signTransaction(tx, {
                    account: address,
                    passphrase,
                    fee,
                    seq
                });

                try {
                    const hash = await sdk.rpc.chain.sendSignedTransaction(
                        signed
                    );
                    if (isLeftTurn) {
                        leftCount += 1;
                        leftFee += fee;
                    } else {
                        rightCount += 1;
                        rightFee += fee;
                    }
                    console.log(`${hash} sent`);
                } catch (err) {
                    console.error(`Cannot send transaction: ${err.message}`);
                }

                isLeftTurn = !isLeftTurn;

                retry = 0;
                await wait(10_000);
            }
        } catch (err) {
            console.error(err.message);
            if (retry === 0) {
                try {
                    await sendSlackWebHook(
                        slackWebHook,
                        "warn",
                        networkId,
                        err.message
                    );
                } catch (err) {
                    console.error(`Cannot send slack message: ${err.message}`);
                    retry = 0;
                }
                try {
                    await sendMail(
                        sendgridApiKey,
                        sendgridTo,
                        "warn",
                        networkId,
                        `has a problem - ${new Date().toISOString()}`,
                        err.message
                    );
                } catch (err) {
                    console.error(`Cannot send mail: ${err.message}`);
                    retry = 0;
                }
            }
            retry += 1;
        }
        await wait(1_000 * Math.min(retry, 30));
    }
}

if (typeof require !== "undefined" && require.main === module) {
    main().catch(console.error);
}

async function sendSlackWebHook(
    slackWebHook: string | null,
    level: string,
    networkId: string,
    message: string
): Promise<void> {
    if (slackWebHook == null) {
        return;
    }
    const webHook = new IncomingWebhook(slackWebHook);
    await webHook.send(`[${level}][${networkId}][juggle-ccc] ${message}`);
}

async function sendMail(
    sendgridApiKey: string | null,
    to: string | null,
    level: string,
    networkId: string,
    title: string,
    value: string
): Promise<void> {
    if (sendgridApiKey == null) {
        return;
    }
    if (to == null) {
        throw Error("to is not specified");
    }
    mail.setApiKey(sendgridApiKey);
    const from = "no-reply+juggle-ccc@devop.codechain.io";
    const subject = `[${level}][${networkId}][juggle-ccc] ${title}`;
    await mail.send({
        from,
        to,
        subject,
        content: [
            {
                type: "text/html",
                value
            }
        ]
    });
}

async function sendDailyReport(
    sendgridApiKey: string,
    sendgridTo: string,
    networkId: string,
    now: Date,
    text: string
) {
    const title = `is working - ${now.toUTCString()}`;
    await sendMail(sendgridApiKey, sendgridTo, "info", networkId, title, text);
}

function makeDailyReport(
    side: string,
    address: string,
    balance: U64,
    count: number,
    fee: number
): string {
    const lines = [
        `has ${balance.toString(10)} CCC`,
        `sends ${count} transactions`,
        `uses ${fee} CCC to pay fee`
    ];
    const reports = lines
        .map(line => `&nbsp;&nbsp;<li>${line}</li>\r\n`)
        .join("");

    return `<p>${side}: ${address}<br /><ul>${reports}</ul><\p>`;
}
