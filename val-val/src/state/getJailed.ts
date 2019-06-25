import { PlatformAddress } from "codechain-primitives";
import Rpc from "codechain-rpc";
import createKey from "../util/createKey";
import toInt from "../util/toInt";
import HANDLER_ID from "./handlerId"

const rlp = require("rlp");

export default async function getJailed(
    networkId: string,
    rpc: Rpc,
    blockNumber: number
): Promise<Map<string, [number, number, number]>> {
    const encodedJailed = await rpc.engine.getCustomActionData({
        handlerId: HANDLER_ID,
        bytes: createKey("Jail"),
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

