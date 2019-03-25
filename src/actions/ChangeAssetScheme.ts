import { H160, PlatformAddress } from "codechain-primitives/lib";
import { AssetScheme } from "codechain-sdk/lib/core/classes";
import { ChangeAssetScheme as ChangeAssetSchemeTx } from "codechain-sdk/lib/core/transaction/ChangeAssetScheme";

import { sdk } from "../configs";
import { State } from "../State";
import { createApprovedTx, Writable } from "../util";
import { Action, isApprovedByAssetRegistrar } from "./Action";

interface AssetSchemeChanges {
    metadata?: string;
    approver?: PlatformAddress;
    registrar?: PlatformAddress;
    allowedScriptHashes?: H160[];
}

export class ChangeAssetScheme extends Action<ChangeAssetSchemeTx> {
    public static async create(params: {
        sender: PlatformAddress;
        approvers?: PlatformAddress[];
        assetType: H160;
        assetScheme: AssetScheme;
        changes: AssetSchemeChanges;
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
                    ...params.changes,
                },
            }),
        });

        return new ChangeAssetScheme({
            sender: params.sender,
            approvers: params.approvers || [],
            assetType: params.assetType,
            changes: params.changes,
            tx,
        });
    }
    public readonly approvers: PlatformAddress[];
    public readonly assetType: H160;
    public readonly changes: AssetSchemeChanges;

    private constructor(params: {
        sender: PlatformAddress;
        approvers: PlatformAddress[];
        assetType: H160;
        changes: AssetSchemeChanges;
        tx: ChangeAssetSchemeTx;
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

    public valid(state: State): boolean {
        return isApprovedByAssetRegistrar(state, this.assetType, this.sender, this.approvers);
    }

    protected apply(state: State) {
        super.apply(state);

        const assetScheme = state.getAssetScheme(this.assetType) as Writable<AssetScheme>;
        console.log(`changes to ${this.assetType.value}`);
        const changes = this.changes;
        if (changes.metadata) {
            console.log(`    metadata: ${assetScheme.metadata} -> ${changes.metadata}`);
            assetScheme.metadata = changes.metadata;
        }
        if (changes.approver) {
            console.log(
                `    ` +
                    `approver: ${(assetScheme.approver || "[null]").toString()}` +
                    ` -> ${changes.approver.value}`,
            );
            assetScheme.approver = changes.approver;
        }
        if (changes.registrar) {
            console.log(
                `    ` +
                    `registrar: ${(assetScheme.registrar || "[null]").toString()}` +
                    ` -> ${changes.registrar.value}`,
            );
            assetScheme.registrar = changes.registrar;
        }
        if (changes.allowedScriptHashes) {
            console.log(
                `    ` +
                    `registrar: ${assetScheme.allowedScriptHashes.map(x => x.toString())}` +
                    ` -> ${changes.allowedScriptHashes.map(x => x.toString())}`,
            );
            assetScheme.allowedScriptHashes = changes.allowedScriptHashes;
        }
    }
}
