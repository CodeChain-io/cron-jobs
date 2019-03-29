import { H256, PlatformAddress, U64 } from "codechain-primitives/lib";
import { SignedTransaction } from "codechain-sdk/lib/core/SignedTransaction";
import { Transaction } from "codechain-sdk/lib/core/Transaction";
import { FEE, sdk } from "./configs";
import { State } from "./State";
import { checkTransaction } from "./util";

export class TxSender {
    private readonly fee: U64;

    public sender: PlatformAddress;
    public getSignedTransaction: (seq: number) => Promise<SignedTransaction>;

    public constructor(sender: PlatformAddress | H256, tx: Transaction) {
        const fee = FEE[tx.constructor.name];
        this.fee = fee;
        if (sender instanceof PlatformAddress) {
            this.sender = sender;
            this.getSignedTransaction = async (seq: number) => {
                return await sdk.key.signTransaction(tx, {
                    account: sender,
                    fee,
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
                    fee,
                    seq,
                });
            };
        }
    }

    public async send(state: State): Promise<void> {
        const seq = state.nextSeq(this.sender);
        console.log(`seq++ ${this.sender.value}: ${seq}`);
        const signedTx = await this.getSignedTransaction(seq);
        const hash = await sdk.rpc.chain.sendSignedTransaction(signedTx);
        console.log("hash", hash.value);
        await checkTransaction(hash);
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
