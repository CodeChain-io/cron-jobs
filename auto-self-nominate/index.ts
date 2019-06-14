import { U64 } from "codechain-primitives/lib";
import { SDK } from "codechain-sdk";
import { PlatformAddress } from "codechain-sdk/lib/core/classes";
import { Custom } from "codechain-sdk/lib/core/transaction/Custom";

const RLP = require("rlp");

const ACTION_TAG_SELF_NOMINATE = 4;
const STAKE_ACTION_HANDLER_ID = 2;

interface CandidatesInfo {
    [key: string]: [number, number];
}

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

const networkId = getConfig("NETWORK_ID");
const rpcUrl = getConfig("RPC_URL");
const needNominationUnderTermLeft = parseInt(getConfig("NEED_NOMINATION_UNDER_TERM_LEFT", "2"), 10);

const sdk = (() => {
    console.log(`sdk ${networkId} ${rpcUrl}`);
    return new SDK({
        server: networkId,
        networkId: rpcUrl,
    });
})();

function decodePlatformAddressFromPubkey(buffer: Buffer): PlatformAddress {
    const pubkey = buffer.toString("hex");
    return PlatformAddress.fromPublic(pubkey, {
        networkId: sdk.networkId,
    });
}

function decodeNumber(buffer: Buffer): number {
    return parseInt(buffer.toString("hex"), 16);
}

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
    const bytes = RLP.encode([actionTag, deposit, metadata]);
    return new Custom(
        {
            handlerId,
            bytes,
        },
        networkId,
    );
}

async function getCandidatesInfo(bestBlockNumber: number): Promise<CandidatesInfo> {
    const retval: CandidatesInfo = {};
    const data = (await sdk.rpc.engine.getCustomActionData(2, ["Candidates"], bestBlockNumber))!;
    const list: Buffer[][] = RLP.decode(Buffer.from(data, "hex"));
    list.forEach(
        ([encodedPubkey, encodedDeposit, encodedNominationEnd]) =>
            (retval[decodePlatformAddressFromPubkey(encodedPubkey).value] = [
                decodeNumber(encodedNominationEnd),
                decodeNumber(encodedDeposit),
            ]),
    );
    return retval;
}

async function needsNomination(
    info: CandidatesInfo,
    bestBlockNumber: number,
    address: string,
): Promise<boolean> {
    if (!info.hasOwnProperty(address)) {
        throw new Error(`SelfNominate first with specific deposit vakue before repeating`);
    }
    const [, nominationEndAt] = info[address];
    const currentTermId = (await getCurrentTermId(bestBlockNumber))!;
    return nominationEndAt - currentTermId < needNominationUnderTermLeft;
}

function supplementaryDeposit(
    info: CandidatesInfo,
    address: string,
    targetDeposit: number,
): number {
    if (!info.hasOwnProperty(address)) {
        throw new Error(`SelfNominate first with specific deposit vakue before repeating`);
    }
    const [deposit] = info[address];
    if (deposit < targetDeposit) {
        return targetDeposit - deposit;
    } else {
        return 0;
    }
}

async function main() {
    const accountAddress = getConfig("ACCOUNT_ADDRESS");
    const passphrase = getConfig("PASSPHRASE");
    const metadata = getConfig("METADATA");
    const targetDeposit = parseInt(getConfig("TARGET_DEPOSIT"), 10);

    setInterval(async () => {
        const bestBlockNumber = await sdk.rpc.chain.getBestBlockNumber()!;
        const info = await getCandidatesInfo(bestBlockNumber);
        if (await needsNomination(info, bestBlockNumber, accountAddress)) {
            const supplement = await supplementaryDeposit(info, accountAddress, targetDeposit);
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
    }, 600_000); // 10 minutes interval
}

main().catch(error => {
    console.log({ error });
    throw error;
});
