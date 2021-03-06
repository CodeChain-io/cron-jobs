import { PlatformAddress, U64 } from "codechain-sdk/lib/core/classes";
import { sdk } from "./config";

const RLP = require("rlp");

export const STAKE_CONSTANT = {
    STAKE_ACTION_HANDLER_ID: 2,
    ACTION_TAG_TRANSFER_CCS: 1,
    ACTION_TAG_DELEGATE_CCS: 2,
    ACTION_TAG_REVOKE: 3,
    ACTION_TAG_SELF_NOMINATE: 4,
    ACTION_TAG_REPORT_DOUBLE_VOTE: 5,
    ACTION_TAG_CHANGE_PARAMS: 0xff,
};

export function decodeU64(buffer: Buffer): U64 {
    if (buffer.length === 0) {
        return new U64(0);
    }
    return U64.ensure("0x" + buffer.toString("hex"));
}

export function decodePlatformAddress(buffer: Buffer): PlatformAddress {
    const accountId = buffer.toString("hex");
    return PlatformAddress.fromAccountId(accountId, {
        networkId: sdk.networkId,
    });
}

export function decodePlatformAddressfromPubkey(buffer: Buffer): PlatformAddress {
    const pubkey = buffer.toString("hex");
    return PlatformAddress.fromPublic(pubkey, {
        networkId: sdk.networkId,
    });
}

export async function getStakeholders(blockNumber: number): Promise<PlatformAddress[]> {
    const data = (await sdk.rpc.engine.getCustomActionData(
        2,
        ["StakeholderAddresses"],
        blockNumber,
    ))!;
    return RLP.decode(Buffer.from(data, "hex")).map(decodePlatformAddress);
}

async function getCCSBalance(address: PlatformAddress, blockNumber: number): Promise<U64> {
    const data = await sdk.rpc.engine.getCustomActionData(
        2,
        ["Account", address.accountId.toEncodeObject()],
        blockNumber,
    );
    if (data == null) {
        return new U64(0);
    }
    return decodeU64(RLP.decode(Buffer.from(data, "hex")));
}

interface Delegation {
    delegatee: PlatformAddress;
    quantity: U64;
}

async function getDelegations(
    delegator: PlatformAddress,
    blockNumber: number,
): Promise<Delegation[]> {
    const data = await sdk.rpc.engine.getCustomActionData(
        2,
        ["Delegation", delegator.accountId.toEncodeObject()],
        blockNumber,
    );
    if (data == null) {
        return [];
    }
    const list: Buffer[][] = RLP.decode(Buffer.from(data, "hex"));
    return list.map(([delegatee, quantity]) => {
        return {
            delegatee: decodePlatformAddress(delegatee),
            quantity: decodeU64(quantity),
        };
    });
}

export interface Weight {
    account: PlatformAddress;
    weight: U64;
}

async function getWeight(account: PlatformAddress, blockNumber: number): Promise<U64> {
    const balance = await getCCSBalance(account, blockNumber);
    const delegations = await getDelegations(account, blockNumber);
    const totalDelegations = delegations
        .map(d => d.quantity)
        .reduce((prev, current) => prev.plus(current), new U64(0));
    return balance.plus(totalDelegations);
}

export async function getWeights(blockNumber: number): Promise<Weight[]> {
    const stakeholders = await getStakeholders(blockNumber);
    const weights = await Promise.all(stakeholders.map(account => getWeight(account, blockNumber)));
    let result = [];
    for (let i = 0; i < stakeholders.length; i++) {
        result.push({
            account: stakeholders[i],
            weight: weights[i],
        });
    }
    return result;
}
