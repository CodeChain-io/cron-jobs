import { PlatformAddress } from "codechain-primitives";
import Rpc from "codechain-rpc";
import { Block, Transaction } from "codechain-rpc";
import HANDLER_ID from "./state/handlerId";
import toInt from "./util/toInt";

const rlp = require("rlp");

type Transferal = {
    type: "transferal";
    receiver: string;
    quantity: number;
    sender: string;
};

type Delegation = {
    type: "delegation";
    delegatee: string;
    quantity: number;
    sender: string;
};

type Revocation = {
    type: "revocation";
    delegatee: string;
    quantity: number;
    sender: string;
};

type Nomination = {
    type: "nomination";
    metadata: string;
    deposit: number;
    sender: string;
};

export type StakeAction = Transferal | Delegation | Revocation | Nomination;

export default async function extractStakeActions(
    rpc: Rpc,
    block: Block
): Promise<[Map<string, number>, Map<string, string>, Map<string, number>]> {
    const ccs = new Map<string, number>();
    const nominations = new Map<string, string>();
    const delegations = new Map<string, number>();
    await Promise.all<void>(
        block.transactions.map(async tx => {
            const action = await extractStakeActionFromTransaction(rpc, tx);
            if (action == null) {
                return;
            }
            const { sender } = action;
            switch (action.type) {
                case "transferal": {
                    const { receiver, quantity } = action;
                    const senderQuantity = ccs.get(sender) || 0;
                    ccs.set(sender, senderQuantity - quantity);
                    const receiverQuantity = ccs.get(receiver) || 0;
                    ccs.set(receiver, receiverQuantity + quantity);
                    break;
                }
                case "delegation": {
                    const { delegatee, quantity } = action;
                    const delegation = delegations.get(delegatee) || 0;
                    delegations.set(delegatee, delegation + quantity);

                    const senderQuantity = ccs.get(sender) || 0;
                    ccs.set(sender, senderQuantity - quantity);
                    break;
                }
                case "revocation": {
                    const { delegatee, quantity } = action;
                    const delegation = delegations.get(delegatee) || 0;
                    delegations.set(delegatee, delegation - quantity);

                    const senderQuantity = ccs.get(sender) || 0;
                    ccs.set(sender, senderQuantity + quantity);
                    break;
                }
                case "nomination": {
                    nominations.set(sender, action.metadata);
                    break;
                }
                default: {
                    throw Error(`Unexpected transaction #${block.number}`);
                }
            }

            // TODO: double vote report
        })
    );

    return [ccs, nominations, delegations];
}

async function extractStakeActionFromTransaction(
    rpc: Rpc,
    tx: Transaction
): Promise<StakeAction | null> {
    const { hash, action, networkId } = tx;
    if (action.type !== "custom") {
        return null;
    }
    // This is a little tricky code.
    // The handlerId is number or string.
    // It makes the comparision simple to call toString first, because toString is identical function for the string.
    if (parseInt(action.handlerId.toString(), undefined) !== HANDLER_ID) {
        return null;
    }

    const sender = (await rpc.chain.getTransactionSigner({
        transactionHash: hash
    }))!;

    const decoded: Buffer[] = rlp.decode(Buffer.from(action.bytes, "hex"));
    const TRANSFERAL = 1;
    const DELEGATION = 2;
    const REVOCATION = 3;
    const NOMINATION = 4;
    switch (toInt(decoded[0])) {
        case TRANSFERAL: {
            const receiver = PlatformAddress.fromAccountId(
                decoded[1].toString("hex"),
                { networkId }
            ).toString();
            const quantity = toInt(decoded[2]);
            return {
                type: "transferal",
                receiver,
                quantity,
                sender
            };
        }
        case DELEGATION: {
            const delegatee = PlatformAddress.fromAccountId(
                decoded[1].toString("hex"),
                { networkId }
            ).toString();
            const quantity = toInt(decoded[2]);
            return {
                type: "delegation",
                delegatee,
                quantity,
                sender
            };
        }
        case REVOCATION: {
            const delegatee = PlatformAddress.fromAccountId(
                decoded[1].toString("hex"),
                { networkId }
            ).toString();
            const quantity = toInt(decoded[2]);
            return {
                type: "revocation",
                delegatee,
                quantity,
                sender
            };
        }
        case NOMINATION: {
            const deposit = toInt(decoded[2]);
            const metadata = decoded[2].toString("hex");
            return {
                type: "nomination",
                deposit,
                metadata,
                sender
            };
        }
        default:
            return null;
    }
}
