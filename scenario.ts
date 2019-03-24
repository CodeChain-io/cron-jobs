import {PlatformAddress, U64, U64Value} from "codechain-primitives/lib";
import {Transaction} from "codechain-sdk/lib/core/Transaction";

import {Action} from "./actions/Action";
import {Transfer, TransferOutput} from "./actions/Transfer"
import {State, Utxo} from "./State";
import {ACCOUNTS, REGULATOR, REGULATOR_ALT} from "./configs";
import {pickRandom} from "./util";

function pickRandomUtxo(utxos: Utxo[], predicate?: (utxo: Utxo) => boolean): Utxo | null {
    if (predicate) {
        var pool = utxos.filter(predicate);
    } else {
        var pool = utxos;
    }
    return pickRandom(pool);
}

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

export const scenarios: { weight: number, scenario: Scenario, }[] = [
    {
        weight: 10,
        scenario:
            async function airdrop_any_10(state: State) {
                const utxo = pickRandomUtxo(state.getUtxos(REGULATOR),
                        utxo => utxo.asset.quantity.isGreaterThanOrEqualTo(10));
                if (!utxo) {
                    return new Skip("Asset is depleted");
                }
                return await Transfer.create({
                    sender: REGULATOR,
                    inputs: [utxo!],
                    outputs: give(utxo, REGULATOR, pickRandom(ACCOUNTS)!, 10),
                });
            },
    }
];
