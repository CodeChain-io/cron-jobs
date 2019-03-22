import {H160, PlatformAddress} from "codechain-primitives/lib";
import {AssetScheme, Transaction} from "codechain-sdk/lib/core/classes";
import {ChangeAssetScheme as ChangeAssetSchemeTx} from "codechain-sdk/lib/core/transaction/ChangeAssetScheme";

import {Action, isApprovedByAssetRegistrar} from "./Action";
import {State} from "../State";
import {sdk} from "../configs";
import {createApprovedTx, Writable} from "../util";
import {AssetTransaction} from "codechain-sdk/lib/core/Transaction";

type AssetSchemeChanges = {
    metadata?: string;
    approver?: PlatformAddress;
    registrar?: PlatformAddress;
    allowedScriptHashes?: H160[];
}

export class ChangeAssetScheme extends Action<ChangeAssetSchemeTx> {
    readonly approvers: PlatformAddress[];
    readonly assetType: H160;
    readonly changes: AssetSchemeChanges;

    private constructor(params: {
        sender: PlatformAddress,
        approvers: PlatformAddress[],
        assetType: H160,
        changes: AssetSchemeChanges,
        tx: ChangeAssetSchemeTx,
    }) {
        super({
            tag: "ChangeAssetScheme",
            sender: params.sender,
            tx: params.tx,
        });
        this.approvers = params.approvers;
        this.assetType = params.assetType;
        this.changes = params.changes;
    }

    static async create(params: {
        sender: PlatformAddress,
        approvers?: PlatformAddress[],
        assetType: H160,
        assetScheme: AssetScheme,
        changes: AssetSchemeChanges,
    }): Promise<ChangeAssetScheme> {
        const tx = await createApprovedTx({
            approvers: params.approvers || [],
            tx: sdk.core.createChangeAssetSchemeTransaction({
                assetType: params.assetType,
                shardId: 0,
                scheme: {
                    networkId: params.assetScheme.networkId,
                    metadata: params.assetScheme.metadata,
                    approver: params.assetScheme.approver || undefined,
                    registrar: params.assetScheme.registrar || undefined,
                    allowedScriptHashes: params.assetScheme.allowedScriptHashes,
                    ...params.changes
                },
            })
        });

        return new ChangeAssetScheme({
            sender: params.sender,
            approvers: params.approvers || [],
            assetType: params.assetType,
            changes: params.changes,
            tx
        })
    }

    protected apply(state: State) {
        super.apply(state);

        const assetScheme = state.getAssetScheme(this.assetType) as Writable<AssetScheme>;
        const changes = this.changes;
        if (changes.metadata) {
            console.log(`change metadata: ${assetScheme.metadata} -> ${changes.metadata}`);
            assetScheme.metadata = changes.metadata;
        }
        if (changes.approver) {
            console.log(`change approver: ${(assetScheme.approver || "[null]").toString()} -> ${changes.approver.value}`);
            assetScheme.approver = changes.approver;
        }
        if (changes.registrar) {
            console.log(`change registrar: ${(assetScheme.registrar || "[null]").toString()} -> ${changes.registrar.value}`);
            assetScheme.registrar = changes.registrar;
        }
        if (changes.allowedScriptHashes) {
            console.log(`change registrar: ${assetScheme.allowedScriptHashes.map(x => x.toString())}`
             + ` -> ${changes.allowedScriptHashes.map(x => x.toString())}`);
            assetScheme.allowedScriptHashes = changes.allowedScriptHashes;
        }
    }

    valid(state: State): boolean {
        return isApprovedByAssetRegistrar(state, this.assetType, this.sender, this.approvers);
    }
}