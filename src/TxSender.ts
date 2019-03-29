import { H256, PlatformAddress, U64 } from "codechain-primitives/lib";
import { SignedTransaction } from "codechain-sdk/lib/core/SignedTransaction";
import { Transaction } from "codechain-sdk/lib/core/Transaction";
import { sdk } from "./configs";
import { State } from "./State";
import { containsTransaction } from "./util";

export class TxSender {
    public fee: U64 = new U64(10);
    public sender: PlatformAddress;
    public getSignedTransaction: (seq: number) => Promise<SignedTransaction>;

    public constructor(sender: PlatformAddress | H256, tx: Transaction) {
        if (sender instanceof PlatformAddress) {
            this.sender = sender;
            this.getSignedTransaction = async (seq: number) => {
                return await sdk.key.signTransaction(tx, {
                    account: sender,
                    fee: this.fee,
                    seq,
                });
            };
        } else {
            const accountId = sdk.util.getAccountIdFromPrivate(sender.value);
            this.sender = PlatformAddress.fromAccountId(accountId, {
                networkId: sdk.networkId,
            });
            this.getSignedTransaction = async (seq: number) => {
                return tx.sign({
                    secret: sender,
                    fee: this.fee,
                    seq,
                });
            };
        }
    }

    public async send(state: State): Promise<H256> {
        const seq = state.nextSeq(this.sender);
        console.log(`seq++ ${this.sender.value}: ${seq}`);
        const signedTx = await this.getSignedTransaction(seq);
        const hash = await sdk.rpc.chain.sendSignedTransaction(signedTx);
        const result = await containsTransaction(hash);
        if (!result) {
            const reason = await sdk.rpc.chain.getErrorHint(hash);
            throw new Error(reason || "Error with no reason");
        }
        return hash;
    }

    public applyFee(state: State) {
        const prevBalance = state.modifyBalance(this.sender, existing => existing.minus(this.fee));
        console.log(
            `tx (fee) ${this.sender.value}: ${prevBalance.toString(10)} => ${state
                .getBalance(this.sender)
                .toString(10)}`,
        );
    }

    public async sendApplyFee(state: State) {
        await this.send(state);
        this.applyFee(state);
    }
}
