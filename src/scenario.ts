import { H160, PlatformAddress, U64, U64Value } from "codechain-primitives/lib";
import { Transaction } from "codechain-sdk/lib/core/Transaction";

import { Action } from "./actions/Action";
import { ChangeAssetScheme } from "./actions/ChangeAssetScheme";
import { Transfer, TransferOutput } from "./actions/Transfer";
import { ASSET_ACCOUNTS, PLATFORM_ADDRESSES, REGULATOR, REGULATOR_ALT } from "./configs";
import { State, Utxo } from "./State";
import { AssetSummarization, pickRandom, pickRandomSize } from "./util";

function give(
    utxo: Utxo,
    sender: PlatformAddress,
    receiver: H160,
    quantity: U64Value,
): TransferOutput[] {
    if (utxo.asset.quantity.isGreaterThan(quantity)) {
        return [
            {
                assetType: utxo.asset.assetType,
                receiver: utxo.owner,
                type: "P2PKH",
                quantity: utxo.asset.quantity.minus(quantity),
            },
            {
                assetType: utxo.asset.assetType,
                receiver,
                type: "P2PKH",
                quantity: U64.ensure(quantity),
            },
        ];
    } else if (utxo.asset.quantity.isEqualTo(quantity)) {
        return [
            {
                assetType: utxo.asset.assetType,
                receiver,
                type: "P2PKH",
                quantity: U64.ensure(quantity),
            },
        ];
    } else {
        throw new Error("quantity is less than required");
    }
}

export class Skip {
    public readonly reason: string;

    public constructor(reason: string) {
        this.reason = reason;
    }
}

interface ScenarioResult {
    expected: boolean;
    action: Action<Transaction>;
}

type Scenario = (state: State) => Promise<ScenarioResult[] | ScenarioResult | Skip>;

export const scenarios: {
    [name: string]: { weight: number; description: string; scenario: Scenario };
} = {
    airDrop: {
        weight: 10,
        description: "Airdrop",
        async scenario(state: State) {
            const utxo = pickRandom(state.getUtxos(REGULATOR.accountId), x =>
                x.asset.quantity.isGreaterThanOrEqualTo(10),
            );
            if (!utxo) {
                return new Skip("Asset is depleted");
            }
            return {
                expected: true,
                action: await Transfer.create({
                    sender: REGULATOR.platformAddress,
                    inputs: [utxo!],
                    outputs: give(utxo, REGULATOR.platformAddress, pickRandom(ASSET_ACCOUNTS)!, 10),
                }),
            };
        },
    },
    takeAllSingleAssetType: {
        weight: 1,
        description: "Take airdropped assets back (one AssetType)",
        async scenario(state: State) {
            const account = pickRandom(ASSET_ACCOUNTS)!;
            const summerized = AssetSummarization.summerizeBy(
                state.getUtxos(account),
                x => x.asset,
            );
            const assetType = pickRandom(summerized.assetTypes());
            if (!assetType) {
                return new Skip("Picked account doesn't have any assets");
            }
            return {
                expected: true,
                action: await Transfer.create({
                    sender: REGULATOR.platformAddress,
                    inputs: summerized.get(assetType).values,
                    outputs: [
                        {
                            assetType: H160.ensure(assetType),
                            quantity: summerized.get(assetType).sum,
                            type: "P2PKH",
                            receiver: REGULATOR.accountId,
                        },
                    ],
                }),
            };
        },
    },
    takeAllAssets: {
        weight: 1,
        description: "Take all airdropped assets back",
        async scenario(state: State) {
            const account = pickRandom(ASSET_ACCOUNTS)!;
            const summerized = AssetSummarization.summerizeBy(
                state.getUtxos(account),
                x => x.asset,
            );
            const assetType = pickRandom(summerized.assetTypes());
            if (!assetType) {
                return new Skip("Picked account doesn't have any assets");
            }
            return {
                expected: true,
                action: await Transfer.create({
                    sender: REGULATOR.platformAddress,
                    inputs: summerized.get(assetType).values,
                    outputs: [
                        {
                            assetType: H160.ensure(assetType),
                            quantity: summerized.get(assetType).sum,
                            type: "P2PKH",
                            receiver: REGULATOR.accountId,
                        },
                    ],
                }),
            };
        },
    },
    assetSchemeCannotBeChanged: {
        weight: 1,
        description: "AssetScheme cannot be changed",
        async scenario(state: State) {
            const [assetType, assetScheme] = pickRandom(state.allAssetSchemes())!;
            const rogue = pickRandom(PLATFORM_ADDRESSES)!;
            return {
                expected: false,
                action: await ChangeAssetScheme.create({
                    assetType,
                    assetScheme,
                    sender: rogue,
                    approvers: pickRandomSize(PLATFORM_ADDRESSES, [0, PLATFORM_ADDRESSES.length]),
                    changes: {
                        registrar: rogue,
                    },
                }),
            };
        },
    },
    registrarOfAssetSchemeCanBeChangedByRegistrar: {
        weight: 1,
        description: "Registrar of AssetScheme can be changed by the registrar",
        async scenario(state: State) {
            const [assetType, assetScheme] = pickRandom(state.allAssetSchemes())!;
            const currentRegistrar = assetScheme.registrar!;
            const otherRegistrar =
                currentRegistrar.value === REGULATOR.platformAddress.value
                    ? REGULATOR_ALT.platformAddress
                    : REGULATOR.platformAddress;
            return {
                expected: true,
                action: await ChangeAssetScheme.create({
                    assetType,
                    assetScheme,
                    sender: currentRegistrar,
                    changes: {
                        registrar: otherRegistrar,
                    },
                }),
            };
        },
    },
    registraOfAssetSchemeCanBeChangedWithApprovalOfRegistrar: {
        weight: 1,
        description: "Registrar of AssetScheme can be changed with approvals of the registrar",
        async scenario(state: State) {
            const [assetType, assetScheme] = pickRandom(state.allAssetSchemes())!;
            const currentRegistrar = assetScheme.registrar!;
            const otherRegistrar =
                currentRegistrar.value === REGULATOR.platformAddress.value
                    ? REGULATOR_ALT.platformAddress
                    : REGULATOR.platformAddress;
            return {
                expected: true,
                action: await ChangeAssetScheme.create({
                    assetType,
                    assetScheme,
                    sender: otherRegistrar,
                    changes: {
                        registrar: otherRegistrar,
                    },
                    approvers: [currentRegistrar],
                }),
            };
        },
    },
};
