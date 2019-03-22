import {
    AssetTransferAddress,
    PlatformAddressValue
} from "codechain-primitives/lib";
import { SDK } from "codechain-sdk";
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
