import { H256, U64, U64Value } from "codechain-primitives";
import { PlatformAddress } from "codechain-primitives/lib";
import { AssetScheme } from "codechain-sdk/lib/core/classes";

import { CreateAsset } from "./actions/CreateAsset";
import {
    ACCOUNTS,
    ASSET_SCHEMES,
    PSUEDO_FAUCET,
    REGULATOR,
    REGULATOR_ALT,
    sdk,
    SERVER,
} from "./configs";
import { scenarios, Skip } from "./scenario";
import { State } from "./State";
import { TxSender } from "./TxSender";
import { assert, makeRandomString, pickWeightedRandom } from "./util";

async function ensureCCC(
    state: State,
    faucet: { secret: H256; address: PlatformAddress },
    accounts: PlatformAddress[],
    threshold: U64Value, // if a balance hits this threshold
    amount: U64Value, // make them to have this amount.
) {
    const poors = accounts
        .map<[PlatformAddress, U64]>(account => [account, state.getBalance(account)])
        .filter(([_, balance]) => balance.isLessThan(threshold));

    if (poors.length > 0) {
        console.log("Ensure accounts to have enough CCC");
    }

    for (const [account, balance] of poors) {
        const toGive = U64.ensure(amount).minus(balance);

        const sendTx = new TxSender(
            faucet.secret,
            sdk.core.createPayTransaction({
                recipient: account,
                quantity: U64.ensure(toGive),
            }),
        );
        await sendTx.sendApplyFee(state);

        const faucetPrev = state.modifyBalance(faucet.address, existing => existing.minus(toGive));
        const accountPrev = state.modifyBalance(account, existing => existing.plus(toGive));

        console.log(
            "    " +
                `pay (sender) ${faucet.address.value}: ${faucetPrev.toString(10)}` +
                ` => ${state.getBalance(faucet.address).toString(10)}`,
        );
        console.log(
            "    " +
                `pay (receiver) ${account.value}: ${accountPrev.toString(10)}` +
                ` => ${state.getBalance(account).toString(10)}`,
        );
    }
}

type EnsureCCC = (state: State) => Promise<void>;

async function initForLocal(state: State): Promise<EnsureCCC> {
    const FAUCET_SECRET = "ede1d4ccb4ec9a8bbbae9a13db3f4a7b56ea04189be86ac3a6a439d9a0a1addd";
    const FAUCET_ACCOUNT_ID = sdk.util.getAccountIdFromPrivate(FAUCET_SECRET);
    const FAUCET = {
        secret: H256.ensure(FAUCET_SECRET),
        accountId: FAUCET_ACCOUNT_ID,
        address: PlatformAddress.fromAccountId(FAUCET_ACCOUNT_ID, {
            networkId: "tc",
        }),
    };

    const ensure = (st: State) =>
        ensureCCC(st, FAUCET, [REGULATOR, REGULATOR_ALT].concat(ACCOUNTS), 100000, 200000);

    await state.recover([FAUCET.address].concat([REGULATOR, REGULATOR_ALT]).concat(ACCOUNTS));
    await ensure(state);

    const randomPostfix = makeRandomString(5);

    const tempAssetSchemes: AssetScheme[] = [
        { name: "SCC1", supply: 1000000 },
        { name: "SCC2", supply: 1000000 },
        { name: "SCC3", supply: 1000000 },
        { name: "SCC4", supply: 1000000 },
        { name: "SCC5", supply: 1000000 },
    ].map(
        ({ name, supply }) =>
            new AssetScheme({
                networkId: sdk.networkId,
                shardId: 0,
                registrar: REGULATOR,
                approver: null,
                allowedScriptHashes: [],
                pool: [],
                supply: U64.ensure(supply),
                metadata: JSON.stringify({
                    name: `${name}-${randomPostfix}`,
                }),
            }),
    );

    for (const assetScheme of tempAssetSchemes) {
        const action = new CreateAsset({
            regulator: REGULATOR,
            assetScheme,
        });
        assert(() => action.valid(state));
        await action.sendApply(state);
    }

    return ensure;
}

async function initUsingIndexer(state: State): Promise<EnsureCCC> {
    const ensurer = (st: State) =>
        ensureCCC(st, PSUEDO_FAUCET, [REGULATOR, REGULATOR_ALT].concat(ACCOUNTS), 1000, 2000);

    await state.recover(
        [PSUEDO_FAUCET.address, REGULATOR, REGULATOR_ALT].concat(ACCOUNTS),
        ASSET_SCHEMES,
    );
    await ensurer(state);
    for (const assetScheme of ASSET_SCHEMES) {
        const action = new CreateAsset({
            regulator: REGULATOR,
            assetScheme,
        });
        if (!state.hasAssetScheme(action.tx.getAssetType())) {
            assert(() => action.valid(state));
            await action.sendApply(state);
        }
    }

    return ensurer;
}

async function main() {
    const state = new State();
    let ensureAmountOfCCC: EnsureCCC;
    if (SERVER === "local") {
        ensureAmountOfCCC = await initForLocal(state);
    } else {
        ensureAmountOfCCC = await initUsingIndexer(state);
    }
    console.log();
    console.log("=== BEGIN SCENARIO ===");
    for (;;) {
        console.log();
        const picked = pickWeightedRandom(scenarios)!;
        console.log(`scenario ${picked.scenario.name}`);

        const scenario = await picked.scenario(state);
        if (scenario instanceof Skip) {
            console.warn(`skip: ${scenario.reason}`);
            continue;
        }

        await scenario.action.sendApply(state, scenario.expected);

        state.printUtxos(...[REGULATOR, REGULATOR_ALT].concat(ACCOUNTS));

        await ensureAmountOfCCC(state);
    }
}

(async () => {
    await main().catch(error => console.log({ error }));
})();
