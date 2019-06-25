import { H512, PlatformAddress } from "codechain-primitives";
import Rpc from "codechain-rpc";
import createKey from "../util/createKey";
import toInt from "../util/toInt";
import HANDLER_ID from "./handlerId"

const rlp = require("rlp");

export default async function getValidators(
    networkId: string,
    rpc: Rpc,
    blockNumber: number
): Promise<Map<string, [number, number, number]>> {
    const encoded = await rpc.engine.getCustomActionData({
        handlerId: HANDLER_ID,
        bytes: createKey("Validators"),
        blockNumber
    });
    if (encoded == null) {
        return new Map();
    }
    const validators: [Buffer, Buffer, Buffer][] = rlp.decode(
        Buffer.from(encoded, "hex")
    );
    return new Map(
        ((validators as any) as [Buffer, Buffer, Buffer, Buffer][]).map(
            ([weight, delegation, deposit, pubkey]: [
                Buffer,
                Buffer,
                Buffer,
                Buffer
                ]) => {
                const weightQuantity = toInt(weight);
                const delegationQuantity = toInt(delegation);
                const depositQuantity = toInt(deposit);
                const address = PlatformAddress.fromPublic(
                    new H512(pubkey.toString("hex")),
                    { networkId }
                ).toString();
                return [
                    address,
                    [weightQuantity, delegationQuantity, depositQuantity]
                ];
            }
        )
    );
}

