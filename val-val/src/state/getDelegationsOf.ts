import { PlatformAddress } from "codechain-primitives";
import Rpc from "codechain-rpc";
import createKey from "../util/createKey";
import toInt from "../util/toInt";
import HANDLER_ID from "./handlerId"

const rlp = require("rlp");

export default async function getDelegationsOf(
    networkId: string,
    rpc: Rpc,
    blockNumber: number,
    delegator: PlatformAddress
): Promise<Map<string, number>> {
    const encoded = await rpc.engine.getCustomActionData({
        handlerId: HANDLER_ID,
        bytes: createKey(
            "Delegation",
            delegator.getAccountId().toEncodeObject()
        ),
        blockNumber
    });
    if (encoded == null) {
        return new Map();
    }

    return new Map((rlp.decode(Buffer.from(encoded, "hex")) as [Buffer, Buffer][]).map(
        ([encodedDelegatee, encodedQuantity]: [Buffer, Buffer]): [
            string,
            number
            ] => [
            PlatformAddress.fromAccountId(
                encodedDelegatee.toString("hex"),
                { networkId }
            ).toString(),
            toInt(encodedQuantity)
        ]
    ));
}

