import { PlatformAddress } from "codechain-primitives";
import Rpc from "codechain-rpc";
import createKey from "../util/createKey";
import toInt from "../util/toInt";
import getStakeholders from "./getStakeholders";
import HANDLER_ID from "./handlerId"

const rlp = require("rlp");

export default async function getDelegations(
    networkId: string,
    rpc: Rpc,
    blockNumber: number
): Promise<Map<string, number>> {
    const stakeholders = await getStakeholders(networkId, rpc, blockNumber);

    const result = new Map();
    for (const stakeholder of stakeholders) {
        const encoded = await rpc.engine.getCustomActionData({
            handlerId: HANDLER_ID,
            bytes: createKey(
                "Delegation",
                stakeholder.getAccountId().toEncodeObject()
            ),
            blockNumber
        });
        if (encoded == null) {
            continue;
        }
        for (const [delegatee, quantity] of (rlp.decode(
            Buffer.from(encoded, "hex")
        ) as [Buffer, Buffer][]).map(
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
        )) {
            result.set(delegatee, (result.get(delegatee) || 0) + quantity);
        }
    }
    return result;
}

