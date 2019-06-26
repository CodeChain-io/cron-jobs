import { PlatformAddress } from "codechain-primitives";
import Rpc from "codechain-rpc";
import createKey from "../util/createKey";
import toInt from "../util/toInt";
import HANDLER_ID from "./handlerId"

const rlp = require("rlp");

export default async function getUndelegatedStake(
    rpc: Rpc,
    blockNumber: number,
    stakeholder: PlatformAddress
): Promise<number> {
    const encoded = await rpc.engine.getCustomActionData({
        handlerId: HANDLER_ID,
        bytes: createKey(
            "Account",
            stakeholder.getAccountId().toEncodeObject()
        ),
        blockNumber
    });
    if (encoded == null) {
        return 0;
    }

    return toInt(rlp.decode(Buffer.from(encoded, "hex")));
}

