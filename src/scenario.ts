import { H160, PlatformAddress, U64, U64Value } from "codechain-primitives/lib";
import { Transaction } from "codechain-sdk/lib/core/Transaction";

import { Action } from "./actions/Action";
import { ChangeAssetScheme } from "./actions/ChangeAssetScheme";
import { Transfer, TransferOutput } from "./actions/Transfer";
import { ASSET_ACCOUNTS, REGULATOR, REGULATOR_ALT } from "./configs";
import { State, Utxo } from "./State";
import { pickRandom } from "./util";

function give(
    utxo: Utxo,
    sender: PlatformAddress,
    receiver: H160,
    quantity: U64Value,
): TransferOutput[] {
    return [
        {
            assetType: utxo.asset.assetType,
            receiver: utxo.owner,
            type: "p2pkh",
            quantity: utxo.asset.quantity.minus(quantity),
        },
        {
            assetType: utxo.asset.assetType,
            receiver,
            type: "p2pkh",
            quantity: U64.ensure(quantity),
        },
    ];
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

type Scenario = (state: State) => Promise<ScenarioResult | Skip>;

export const scenarios = {
    airDrop: {
        weight: 10,
        description: "Airdrop",
        async scenario(state: State) {
            const utxo = pickRandom(
                state.getUtxos(REGULATOR.accountId),
                x =>
                    x.asset.quantity.isGreaterThanOrEqualTo(10) &&
                    state.getAssetScheme(x.asset.assetType).registrar!.value ===
                        REGULATOR.platformAddress.value,
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
    tryAirDropOthers: {
        weight: 1,
        description: "Try Airdrop other's asset",
        async scenario(state: State) {
            const utxo = pickRandom(
                state.getUtxos(REGULATOR.accountId),
                x =>
                    x.asset.quantity.isGreaterThanOrEqualTo(10) &&
                    state.getAssetScheme(x.asset.assetType).registrar!.value !==
                        REGULATOR.platformAddress.value,
            );
            if (!utxo) {
                return new Skip("Asset is depleted");
            }
            return {
                expected: false,
                action: await Transfer.create({
                    sender: REGULATOR.platformAddress,
                    inputs: [utxo!],
                    outputs: give(utxo, REGULATOR.platformAddress, pickRandom(ASSET_ACCOUNTS)!, 10),
                }),
            };
        },
    },
    airdropOthersButWithApprovals: {
        weight: 1,
        description: "Airdrop other's asset with other's approval",
        async scenario(state: State) {
            const utxo = pickRandom(
                state.getUtxos(REGULATOR.accountId),
                x =>
                    x.asset.quantity.isGreaterThanOrEqualTo(10) &&
                    state.getAssetScheme(x.asset.assetType).registrar!.value !==
                        REGULATOR.platformAddress.value,
            );
            if (!utxo) {
                return new Skip("Asset is depleted");
            }
            return {
                expected: true,
                action: await Transfer.create({
                    sender: REGULATOR.platformAddress,
                    approvers: [REGULATOR_ALT.platformAddress],
                    inputs: [utxo!],
                    outputs: give(utxo, REGULATOR.platformAddress, pickRandom(ASSET_ACCOUNTS)!, 10),
                }),
            };
        },
    },
    registrarChangesRegistrarOfAssetScheme: {
        weight: 1,
        description: "Registrar can change registrar of AssetScheme",
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
};
