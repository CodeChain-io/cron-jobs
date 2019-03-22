import {Transaction} from "codechain-sdk/lib/core/classes";
import {H160, PlatformAddress} from "codechain-primitives/lib";

import {TxSender} from "../TxSender";
import {State} from "../State";

export abstract class Action<Tx extends Transaction> {
    readonly tag: string;
    readonly tx: Tx;
    readonly sender: PlatformAddress;
    readonly txSender: TxSender;

    protected constructor(params: { sender: PlatformAddress, tx: Tx, tag: string }) {
        this.tag = params.tag;
        this.tx = params.tx;
        this.sender = params.sender;
        this.txSender = new TxSender(params.sender, params.tx);
    }

    protected async send(state: State) {
        console.log(`send ${this.tag}`);
        await this.txSender.send(state);
    }

    protected apply(state: State) {
        this.txSender.applyFee(state);
    }

    async sendApply(state: State) {
        if (this.valid(state)) {
            await this.send(state);
            this.apply(state);
            console.log("succeed");
        } else {
            try {
                await this.send(state);
            } catch (e) {
                this.txSender.applyFee(state);
                console.log("failed as expected");
                return;
            }
            throw new Error("Should fail but not failed");
        }
    }

    abstract valid(state: State): boolean;
}

export function isApprovedByAssetRegistrar(state: State, assetType: H160, sender: PlatformAddress, approvers: PlatformAddress[]) {
    const scheme = state.getAssetScheme(assetType);
    const registrar = scheme.registrar!;
    if (registrar.value === sender.value) {
        return true;
    }
    return approvers.findIndex(approver => approver.value === registrar.value) != -1;
}