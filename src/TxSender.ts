import {H256, PlatformAddress, U64} from "codechain-primitives/lib";
import {SignedTransaction} from "codechain-sdk/lib/core/SignedTransaction";
import {Transaction} from "codechain-sdk/lib/core/Transaction";
import {sdk} from "./configs";
import {State} from "./State";

export class TxSender {
    fee: U64 = new U64(10);
    sender: PlatformAddress;
    getSignedTransaction: (seq: number) => Promise<SignedTransaction>;

    constructor(sender: PlatformAddress | H256, tx: Transaction) {
        if (sender instanceof PlatformAddress) {
            this.sender = sender;
            this.getSignedTransaction = async (seq: number) => {
                return await sdk.key.signTransaction(
                    tx, {
                        account: sender,
                        fee: this.fee,
                        seq,
                    }
                );
            }
        } else {
            const accountId = sdk.util.getAccountIdFromPrivate(sender.value);
            this.sender = PlatformAddress.fromAccountId(accountId, {networkId: sdk.networkId});
            this.getSignedTransaction = async (seq: number) => {
                return tx.sign({
                    secret: sender,
                    fee: this.fee,
                    seq
                });
            }
        }
    }

    async send(state: State) {
        const seq = state.nextSeq(this.sender);
        console.log(`seq++ ${this.sender.value}: ${seq}`);
        const signedTx = await this.getSignedTransaction(seq);
        const hash = await sdk.rpc.chain.sendSignedTransaction(signedTx);
        const result = await sdk.rpc.chain.getTransactionResult(
            hash,
            {
                timeout: 300 * 1000,
            }
        );
        if (!result) {
            const reason = await sdk.rpc.chain.getErrorHint(hash);
            throw new Error(reason || "Error with no reason");
        }
    }

    applyFee(state: State) {
        const prevBalance = state.modifyBalance(this.sender, existing => existing.minus(this.fee));
        console.log(`tx (fee) ${this.sender.value}: ${prevBalance.toString(10)} => ${state.getBalance(this.sender).toString(10)}`);
    }

    async sendApplyFee(state: State) {
        await this.send(state);
        this.applyFee(state);
    }
}