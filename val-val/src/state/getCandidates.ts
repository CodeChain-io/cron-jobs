import { H512, PlatformAddress } from "codechain-primitives";
import Rpc from "codechain-rpc";
import createKey from "../util/createKey";
import toInt from "../util/toInt";
import HANDLER_ID from "./handlerId";

const rlp = require("rlp");

export default async function getCandidates(
    networkId: string,
    rpc: Rpc,
    blockNumber: number,
): Promise<Map<string, [number, number, string]>> {
    const encoded = await rpc.engine.getCustomActionData({
        handlerId: HANDLER_ID,
        bytes: createKey("Candidates"),
        blockNumber
    });
    if (encoded == null) {
        return new Map();
    }

    const candidates: [Buffer, Buffer, Buffer, Buffer][] = rlp.decode(
        Buffer.from(encoded, "hex")
    );
    return new Map(
        candidates
            .map(([pubkey, deposit, nominationEndAt, metadata]: [Buffer, Buffer, Buffer, Buffer]) => {
                const address = PlatformAddress.fromPublic(
                    new H512(pubkey.toString("hex")),
                    { networkId }
                ).toString();
                const quantity = toInt(deposit);
                const expiration = toInt(nominationEndAt);
                return [address, [quantity, expiration, metadata.toString("hex")]] as [string, [number, number, string]];
            })
    );
}

