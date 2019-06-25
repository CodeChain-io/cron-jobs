import { PlatformAddress } from "codechain-primitives";
import Rpc from "codechain-rpc";
import createKey from "../util/createKey";
import HANDLER_ID from "./handlerId"

const rlp = require("rlp");

export default async function getStakeholders(
    networkId: string,
    rpc: Rpc,
    blockNumber: number
): Promise<PlatformAddress[]> {
    const encoded = await rpc.engine.getCustomActionData({
        handlerId: HANDLER_ID,
        bytes: createKey("StakeholderAddresses"),
        blockNumber
    });
    const decoded: Buffer[] = rlp.decode(Buffer.from(encoded, "hex"));
    const stakeholders: PlatformAddress[] = decoded.map(
        (address: Buffer): PlatformAddress =>
            PlatformAddress.fromAccountId(address.toString("hex"), {
                networkId
            })
    );
    return stakeholders;
}

