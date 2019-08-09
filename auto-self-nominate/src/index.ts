import { SDK } from "codechain-sdk";
import { PlatformAddress, U64 } from "codechain-sdk/lib/core/classes";
import * as stake from "codechain-stakeholder-sdk";

import { createEmail } from "./Email";
import { createSlack } from "./Slack";

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

async function sendSelfNominateTransaction(
    accountInfo: { account: string; passphrase: string },
    params: { deposit: U64; metadata: string },
) {
    const tx = stake.createSelfNominateTransaction(sdk, params.deposit, params.metadata);
    const { account, passphrase } = accountInfo;
    const result = await sdk.rpc.account.sendTransaction({
        tx,
        account,
        passphrase,
    });

    for (let i = 0; i < 30; i++) {
        if ((await sdk.rpc.chain.containsTransaction(result.hash)) === true) {
            return result.hash;
        }
        const errorHint = await sdk.rpc.chain.getErrorHint(result.hash);
        if (errorHint !== null) {
            throw new Error(errorHint);
        }
        await new Promise(resolve => setTimeout(resolve, 2 * 1000));
    }
    throw new Error("Timeout (60s) while send self nominate transaction");
}

async function getCandidate(accountAddress: string, bestBlockNumber: number) {
    const candidates = (await stake.getCandidates(sdk, bestBlockNumber)).map(x => ({
        ...x,
        address: PlatformAddress.fromPublic(x.pubkey, {
            networkId: sdk.networkId,
        }),
    }));
    return candidates.find(x => x.address.toString() === accountAddress);
}

async function needsNomination(
    candidate: stake.Candidate & { address: PlatformAddress } | undefined,
    currentTermId: number,
): Promise<boolean> {
    if (candidate === undefined) {
        return true;
    }
    if (candidate.nominationEndsAt.lt(currentTermId)) {
        return true;
    }
    const remaining = candidate.nominationEndsAt.minus(currentTermId);
    return remaining.lte(needNominationUnderTermLeft);
}

function supplementaryDeposit(
    candidate: stake.Candidate & { address: PlatformAddress } | undefined,
    targetDeposit: number,
): U64 {
    if (candidate === undefined) {
        return new U64(targetDeposit);
    }
    if (candidate.deposit.lt(targetDeposit)) {
        return new U64(targetDeposit).minus(candidate.deposit);
    } else {
        return new U64(0);
    }
}

function sendAlarmForBanned(address: string) {
    const content = `Your account ${address} is permanently banned`;
    console.error(content);
    email.sendError(content);
    slack.sendError(content);
}

function sendAlarmForJailed(address: string, info: stake.Prisoner) {
    const content = `Your account ${address} was jailed. The account will be in custody until the term ${info.custodyUntil.toString()} and will be released at the term ${info.releasedAt.toString()}`;
    console.error(content);
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
        const currentTermId = (await stake.getTermMetadata(sdk, bestBlockNumber))!.currentTermId;
        console.log("Best block number:", bestBlockNumber);
        console.log("Current Term Id:", currentTermId);

        const bannedAccounts = await stake.getBanned(sdk, bestBlockNumber);
        const isBanned = bannedAccounts.some(x => x.toString() === accountAddress);
        if (isBanned) {
            sendAlarmForBanned(accountAddress);
            return;
        }
        const jailedAccounts = await stake.getJailed(sdk, bestBlockNumber);
        const jailed = jailedAccounts.find(x => x.address.toString() === accountAddress);
        if (jailed !== undefined) {
            sendAlarmForJailed(accountAddress, jailed);
            return;
        }

        const candidate = await getCandidate(accountAddress, bestBlockNumber);
        if (!(await needsNomination(candidate, currentTermId))) {
            console.log("No need to self-nominate");
            console.group("Candidate info");
            console.log("Deposit", candidate!.deposit.toLocaleString());
            console.log("Ends at", candidate!.nominationEndsAt.toString());
            console.groupEnd();
            return;
        }
        const supplement = supplementaryDeposit(candidate, targetDeposit);
        console.log("Deposit Supplement:", supplement.toLocaleString());
        const hash = await sendSelfNominateTransaction(
            {
                account: accountAddress,
                passphrase,
            },
            {
                deposit: supplement,
                metadata,
            },
        );
        console.log("Self Nomination tx sent:", hash.toString());

        const newBestBlockNumber = await sdk.rpc.chain.getBestBlockNumber()!;
        const newCandidate = await getCandidate(accountAddress, newBestBlockNumber);
        if (newCandidate !== undefined) {
            console.group("Candidate info");
            console.log("Deposit", candidate!.deposit.toLocaleString());
            console.log("Ends at", candidate!.nominationEndsAt.toString());
            console.groupEnd();
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
