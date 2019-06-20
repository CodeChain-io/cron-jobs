import { U64 } from "codechain-primitives/lib";
import { SDK } from "codechain-sdk";
import { Custom } from "codechain-sdk/lib/core/transaction/Custom";
import {
    BannedAccountsInfo,
    CandidatesInfo,
    getStatesInfos,
    JailedAccountInfo,
    JailedAccountsInfo,
} from "./AccountState";
import { createEmail } from "./Email";
import { createSlack } from "./Slack";

const RLP = require("rlp");

const ACTION_TAG_SELF_NOMINATE = 4;
const STAKE_ACTION_HANDLER_ID = 2;

function getConfig(field: string, defaultVal?: string): string {
    const c = process.env[field];
    if (c == null) {
        if (defaultVal == null) {
            throw new Error(`${field} is not specified`);
        }
        return defaultVal;
    }
    return c;
}

function getConfigOption(field: string): string | undefined {
    try {
        return getConfig(field);
    } catch (e) {
        return undefined;
    }
}

const networkId = getConfig("NETWORK_ID");
const rpcUrl = getConfig("RPC_URL");
const needNominationUnderTermLeft = parseInt(getConfig("NEED_NOMINATION_UNDER_TERM_LEFT", "2"), 10);
const email = createEmail({
    tag: `[${networkId}][auto-self-nominate]`,
    to: getConfigOption("SENDGRID_TO"),
    sendgridApiKey: getConfigOption("SENDGRID_API_KEY"),
});
const slack = createSlack(
    `[${networkId}][auto-self-nominate]`,
    getConfigOption("SLACK_WEBHOOK_URL"),
);

const sdk = (() => {
    console.log(`sdk ${networkId} ${rpcUrl}`);
    return new SDK({
        server: rpcUrl,
        networkId,
    });
})();

async function getCurrentTermId(bestBlockNumber: number): Promise<number | null> {
    return new Promise((resolve, reject) => {
        sdk.rpc
            .sendRpcRequest("chain_getTermMetadata", [bestBlockNumber])
            .then(result => {
                if (result === null) {
                    resolve(null);
                }
                const [prevTermLastBlockNumber, currentTermId] = result;
                if (
                    typeof prevTermLastBlockNumber === "number" &&
                    typeof currentTermId === "number"
                ) {
                    resolve(currentTermId);
                }
                reject(
                    Error(
                        `Expected getTermMetadata to return [number, number] | null but it returned ${result}`,
                    ),
                );
            })
            .catch(reject);
    });
}

async function sendSelfNominateTransaction(
    accountInfo: { account: string; passphrase: string },
    params: { deposit: U64; metadata: string },
) {
    const tx = createSelfNomination(params);
    const { account, passphrase } = accountInfo;
    await sdk.rpc.account.sendTransaction({
        tx,
        account,
        passphrase,
    });
}

function createSelfNomination(params: { deposit: U64; metadata: string }): Custom {
    const { deposit, metadata } = params;
    const handlerId = new U64(STAKE_ACTION_HANDLER_ID);
    const actionTag = ACTION_TAG_SELF_NOMINATE;
    const bytes = RLP.encode([actionTag, deposit.toEncodeObject(), metadata]);
    return new Custom(
        {
            handlerId,
            bytes,
        },
        networkId,
    );
}

async function needsNomination(
    info: CandidatesInfo,
    bestBlockNumber: number,
    address: string,
): Promise<boolean> {
    if (!info.hasOwnProperty(address)) {
        return true;
    }
    const { nominateEndAt } = info[address];
    const currentTermId = (await getCurrentTermId(bestBlockNumber))!;
    return nominateEndAt - currentTermId < needNominationUnderTermLeft;
}

function supplementaryDeposit(
    info: CandidatesInfo,
    address: string,
    targetDeposit: number,
): number {
    if (!info.hasOwnProperty(address)) {
        return targetDeposit;
    }
    const { deposits } = info[address];
    if (deposits < targetDeposit) {
        return targetDeposit - deposits;
    } else {
        return 0;
    }
}

function sendAlarmForBanned(address: string) {
    const content = `Your account ${address} is permanently banned`;
    email.sendError(content);
    slack.sendError(content);
}

function sendAlarmForJailed(address: string, info: JailedAccountInfo) {
    const content = `Your account ${address} was jailed. The account will be in custody until the term ${info.custodyUntil} and will be released at the term ${info.releasedAt}`;
    email.sendWarning(content);
    slack.sendWarning(content);
}

async function main() {
    const accountAddress = getConfig("ACCOUNT_ADDRESS");
    const passphrase = getConfig("PASSPHRASE");
    const metadata = getConfig("METADATA");
    const targetDeposit = parseInt(getConfig("TARGET_DEPOSIT"), 10);
    const interval = parseInt(getConfig("INTERVAL_SECONDS", "600"), 10); // default interval is 10 minutes

    async function send() {
        const bestBlockNumber = await sdk.rpc.chain.getBestBlockNumber()!;
        const bannedAccounts = (await getStatesInfos(
            sdk,
            "Banned",
            bestBlockNumber,
        )) as BannedAccountsInfo;
        const isBanned = bannedAccounts.accounts.includes(accountAddress);
        if (isBanned) {
            sendAlarmForBanned(accountAddress);
            return;
        }
        const jailedAccounts = (await getStatesInfos(
            sdk,
            "Jailed",
            bestBlockNumber,
        )) as JailedAccountsInfo;
        const isJailed = jailedAccounts.hasOwnProperty(accountAddress);
        if (isJailed) {
            sendAlarmForJailed(accountAddress, jailedAccounts[accountAddress]);
            return;
        }
        const info = await getStatesInfos(sdk, "Candidates", bestBlockNumber);
        if (await needsNomination(info as CandidatesInfo, bestBlockNumber, accountAddress)) {
            const supplement = await supplementaryDeposit(
                info as CandidatesInfo,
                accountAddress,
                targetDeposit,
            );
            await sendSelfNominateTransaction(
                {
                    account: accountAddress,
                    passphrase,
                },
                {
                    deposit: new U64(supplement),
                    metadata,
                },
            );
        }
    }
    send().catch(console.error);
    setInterval(() => {
        send().catch(console.error);
    }, interval * 1_000);
}

main().catch(error => {
    console.log({ error });
    throw error;
});
