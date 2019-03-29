import {
    AssetTransferAddress,
    PlatformAddressValue,
    H256
} from "codechain-primitives/lib";
import { SDK } from "codechain-sdk";
import { Block } from "codechain-sdk/lib/core/Block";
import { Timelock } from "codechain-sdk/lib/core/classes";
import { MemoryKeyStore } from "codechain-sdk/lib/key/MemoryKeyStore";
import { P2PKH } from "codechain-sdk/lib/key/P2PKH";
import * as config from "config";

export async function createRandomAssetTransferAddress(): Promise<
    AssetTransferAddress
> {
    try {
        const networkId = getConfig<string>("networkId");
        const p2pkh = new P2PKH({
            keyStore: new MemoryKeyStore(),
            networkId
        });

        return p2pkh.createAddress({
            passphrase: "pass"
        });
    } catch (err) {
        console.error("Error while createRandomAssetTransferAddress");
        throw err;
    }
}

export function getConfig<T>(field: string): T {
    const c = config.get<T>(field);
    if (c == null) {
        throw new Error(`${field} is not specified`);
    }
    return c;
}

export function haveConfig(field: string): boolean {
    return !!config.has(field) && config.get(field) != null;
}

export function delay(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, ms);
    });
}

export async function getCurrentSeq(
    sdk: SDK,
    account: PlatformAddressValue
): Promise<number> {
    return sdk.rpc.chain.getSeq(account);
}

export function createTimelock(
    currentBlock: Block,
    timelockType: Timelock["type"]
): Timelock {
    switch (timelockType) {
        case "block":
            return {
                type: "block",
                value: currentBlock.number + 10
            };
        case "blockAge":
            return {
                type: "blockAge",
                value: 10
            };
        case "time":
            return {
                type: "time",
                value: currentBlock.timestamp + 30
            };
        case "timeAge":
            return {
                type: "timeAge",
                value: 30
            };
    }
}

export async function waitContainTransacitonSuccess(
    sdk: SDK,
    txHash: H256,
    timeout: number
) {
    while (true) {
        const contains = await sdk.rpc.chain.containTransaction(txHash);
        if (contains) {
            return;
        }

        if (timeout < 0) {
            throw new Error(`Transaction timeout ${txHash.toString()}`);
        }

        await delay(500);
        timeout -= 500;
    }
}
