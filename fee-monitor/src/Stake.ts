import { PlatformAddress, U64 } from "codechain-sdk/lib/core/classes";
import { sdk } from "./config";

const RLP = require("rlp");

function decodeU64(buffer: Buffer): U64 {
    return U64.ensure("0x" + buffer.toString("hex"));
}

function decodePlatformAddress(buffer: Buffer): PlatformAddress {
    const accountId = buffer.toString("hex");
    return PlatformAddress.fromAccountId(accountId, {
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
