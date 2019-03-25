import {PlatformAddress, U64, U64Value} from "codechain-primitives/lib";
import {Transaction} from "codechain-sdk/lib/core/Transaction";

import {Action} from "./actions/Action";
import {Transfer, TransferOutput} from "./actions/Transfer"
import {State, Utxo} from "./State";
import {ACCOUNTS, REGULATOR, REGULATOR_ALT} from "./configs";
import {pickRandom} from "./util";
import {ChangeAssetScheme} from "./actions/ChangeAssetScheme";

function give(utxo: Utxo, sender: PlatformAddress, receiver: PlatformAddress, quantity: U64Value): TransferOutput[] {
    return [{
        assetType: utxo.asset.assetType,
        receiver: sender,
        type: "p2pkh",
        quantity: utxo.asset.quantity.minus(quantity)
    }, {
        assetType: utxo.asset.assetType,
        receiver,
        type: "p2pkh",
        quantity: U64.ensure(quantity),
    }]
}

export class Skip {
    readonly reason: string;

    constructor(reason: string) {
        this.reason = reason;
    }
}

type Scenario = (state: State) => Promise<Action<Transaction> | Skip>;

export const scenarios: { weight: number, expected: boolean, scenario: Scenario }[] = [
    {
        weight: 10,
        expected: true,
        scenario:
            async function airdrop_any_10(state: State) {
                const utxo = pickRandom(state.getUtxos(REGULATOR),
                    utxo => utxo.asset.quantity.isGreaterThanOrEqualTo(10)
                        && state.getAssetScheme(utxo.asset.assetType).registrar!.value == REGULATOR.value);
                if (!utxo) {
                    return new Skip("Asset is depleted");
                }
                return await Transfer.create({
                    sender: REGULATOR,
                    inputs: [utxo!],
                    outputs: give(utxo, REGULATOR, pickRandom(ACCOUNTS)!, 10),
                });
            },
    }, {
        weight: 1,
        expected: false,
        scenario:
            async function try_airdrop_others_asset(state: State) {
                const utxo = pickRandom(state.getUtxos(REGULATOR),
                    utxo => utxo.asset.quantity.isGreaterThanOrEqualTo(10)
                        && state.getAssetScheme(utxo.asset.assetType).registrar!.value != REGULATOR.value);
                if (!utxo) {
                    return new Skip("Asset is depleted");
                }
                return await Transfer.create({
                    sender: REGULATOR,
                    inputs: [utxo!],
                    outputs: give(utxo, REGULATOR, pickRandom(ACCOUNTS)!, 10),
                })
            },
    }, {
        weight: 1,
        expected: true,
        scenario:
            async function registrar_changes_registrar_of_asset_scheme(state: State) {
                const [assetType, assetScheme] = pickRandom(state.allAssetSchemes())!;
                const current_registrar = assetScheme.registrar!;
                const other_registrar = (current_registrar.value == REGULATOR.value) ? REGULATOR_ALT : REGULATOR;
                return await ChangeAssetScheme.create({
                    assetType: assetType,
                    assetScheme: assetScheme,
                    sender: current_registrar,
                    changes: {
                        registrar: other_registrar,
                    },
                })
            },
    },
];
