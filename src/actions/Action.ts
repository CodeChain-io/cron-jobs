import { H160, PlatformAddress } from "codechain-primitives/lib";
import { Transaction } from "codechain-sdk/lib/core/classes";

import { State } from "../State";
import { TxSender } from "../TxSender";
import { assert } from "../util";

export abstract class Action<Tx extends Transaction> {
    public readonly tag: string;
    public readonly tx: Tx;
    public readonly sender: PlatformAddress;
    public readonly txSender: TxSender;

    protected constructor(params: { sender: PlatformAddress; tx: Tx; tag: string }) {
        this.tag = params.tag;
        this.tx = params.tx;
        this.sender = params.sender;
        this.txSender = new TxSender(params.sender, params.tx);
    }

    public async sendApply(state: State, expected?: boolean) {
        const valid = this.valid(state);
        assert(() => valid === (expected == null ? true : expected));
        if (valid) {
            try {
                await this.send(state);
                this.apply(state);
                console.log("succeed");
            } catch (e) {
                console.error(`failed to send tx: `);
                console.error(JSON.stringify(this.tx.toJSON(), null, "     "));
                throw e;
            }
        } else {
            try {
                await this.send(state);
            } catch (e) {
                this.txSender.applyFee(state);
                console.log("failed as expected");
                return;
            }
            console.error(`failed to fail tx: `);
            console.error(JSON.stringify(this.tx.toJSON(), null, "     "));
            throw new Error("Should fail but not failed");
        }
    }

    public abstract valid(state: State): boolean;

    protected async send(state: State) {
        console.log(`send ${this.tag}`);
        await this.txSender.send(state);
    }

    protected apply(state: State) {
        this.txSender.applyFee(state);
    }
}

export function isApprovedByAssetRegistrar(
    state: State,
    assetType: H160,
    sender: PlatformAddress,
    approvers: PlatformAddress[],
) {
    const scheme = state.getAssetScheme(assetType);
    const registrar = scheme.registrar!;
    if (registrar.value === sender.value) {
        return true;
    }
    return approvers.findIndex(approver => approver.value === registrar.value) !== -1;
}
