import { H512, PlatformAddress, toHex } from "codechain-primitives";
import Rpc from "codechain-rpc";

const rlp = require("rlp");

const HANDLER_ID = 2;

function createKey(...params: any[]): string {
    return `0x${toHex(rlp.encode(params))}`;
}

function toInt(buffer: Buffer): number {
    return parseInt(buffer.toString("hex"), 16);
}

async function getJailed(
    networkId: string,
    rpc: Rpc,
    blockNumber: number
): Promise<Map<string, [number, number, number]>> {
    const encodedJailed = await rpc.engine.getCustomActionData({
        handlerId: HANDLER_ID,
        bytes: createKey("Jailed"),
        blockNumber
    });
    if (encodedJailed == null) {
        return new Map();
    }
    const jailed: [Buffer, Buffer, Buffer, Buffer][] = rlp.decode(
        Buffer.from(encodedJailed, "hex")
    );
    return new Map(
        ((jailed as any) as [Buffer, Buffer, Buffer, Buffer][]).map(
            (encoded: [Buffer, Buffer, Buffer, Buffer]) => {
                const address = PlatformAddress.fromAccountId(
                    encoded[0].toString("hex"),
                    { networkId }
                ).toString();
                const deposit = toInt(encoded[1]);
                const custodyUntil = toInt(encoded[2]);
                const releaseAt = toInt(encoded[3]);
                return [address, [deposit, custodyUntil, releaseAt]] as [
                    string,
                    [number, number, number]
                ];
            }
        )
    );
}

async function getValidators(
    networkId: string,
    rpc: Rpc,
    blockNumber: number
): Promise<Set<string>> {
    const encoded = await rpc.engine.getCustomActionData({
        handlerId: HANDLER_ID,
        bytes: createKey("Validators"),
        blockNumber
    });
    if (encoded == null) {
        return new Set();
    }
    const validators: [Buffer, Buffer, Buffer][] = rlp.decode(
        Buffer.from(encoded, "hex")
    );
    return new Set(
        ((validators as any) as [Buffer, Buffer, Buffer, Buffer][]).map(
            ([, , , pubkey]: [Buffer, Buffer, Buffer, Buffer]) => {
                return PlatformAddress.fromPublic(
                    new H512(pubkey.toString("hex")),
                    { networkId }
                ).toString();
            }
        )
    );
}

export default async function check(
    networkId: string,
    rpc: Rpc,
    blockNumber: number,
    termId: number,
    blockAuthors: Set<string>
): Promise<void> {
    // FIXME: Please remove the banned accounts.
    const previous = await getJailed(networkId, rpc, blockNumber - 1);
    const current = await getJailed(networkId, rpc, blockNumber);
    for (const [
        address,
        [deposit, custodyUntil, releaseAt]
    ] of previous.entries()) {
        if (releaseAt + 1 < termId) {
            throw Error(`Why ${address} is not released yet? #${blockNumber}`);
        }
        if (releaseAt + 1 === termId) {
            if (current.has(address)) {
                throw Error(
                    `${address} should be released at term #${releaseAt}. Current term id: ${termId}. #${blockNumber}`
                );
            }
            continue;
        }
        const jailedAddress = current.get(address);
        if (jailedAddress == null) {
            throw Error(
                `${address} should not be released yet. #${blockNumber}`
            );
        }
        if (
            deposit !== jailedAddress[0] ||
            custodyUntil !== jailedAddress[1] ||
            releaseAt !== jailedAddress[2]
        ) {
            throw Error(
                `The jailed information of ${address} has been changed. #${blockNumber}`
            );
        }
    }

    const newlyJailedAddresses = new Set(current.keys());
    for (const address of previous.keys()) {
        newlyJailedAddresses.delete(address);
    }
    const neglectingValidators = await getValidators(
        networkId,
        rpc,
        blockNumber - 1
    );
    for (const address of blockAuthors) {
        neglectingValidators.delete(address);
    }
    for (const address of neglectingValidators) {
        if (!newlyJailedAddresses.has(address)) {
            throw Error(`${address} must be jailed. #${blockNumber}`);
        }
    }
    for (const address of newlyJailedAddresses) {
        if (!neglectingValidators.has(address)) {
            throw Error(`${address} should not be jailed. #${blockNumber}`);
        }
    }
}
