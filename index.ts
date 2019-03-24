import {H256, H256Value, U64, U64Value} from "codechain-primitives";
import {AssetScheme} from "codechain-sdk/lib/core/classes";
import {PlatformAddress} from "codechain-primitives/lib";

import {ACCOUNTS, ASSET_SCHEMES, PSUEDO_FAUCET, REGULATOR, REGULATOR_ALT, sdk, SERVER} from "./configs";
import {TxSender} from "./TxSender";
import {State} from "./State";
import {CreateAsset} from "./actions/CreateAsset";
import {assert, makeRandomString, pickRandom, pickWeightedRandom, sleep} from "./util";
import {scenarios, Skip} from "./scenario";

async function ensureCCC(
    state: State,
    faucet: { secret: H256, address: PlatformAddress },
    accounts: PlatformAddress[],
    threshold: U64Value, // if a balance hits this threshold
    amount: U64Value,    // make them to have this amount.
) {
    const poors = accounts
        .map<[PlatformAddress, U64]>(account => [account, state.getBalance(account)])
        .filter(([account, balance]) => balance.isLessThan(threshold));

    if (poors.length > 0) {
        console.log("Ensure accounts to have enough CCC");
    }

    for (const [account, balance] of poors) {
        const toGive = U64.ensure(amount).minus(balance);

        const sendTx = new TxSender(faucet.secret,
            sdk.core.createPayTransaction({
                recipient: account,
                quantity: U64.ensure(toGive),
            }));
        await sendTx.sendApplyFee(state);

        const faucetPrev = state.modifyBalance(faucet.address, existing => existing.minus(toGive));
        const accountPrev = state.modifyBalance(account, existing => existing.plus(toGive));

        console.log(`    pay (sender) ${faucet.address.value}: ${faucetPrev.toString(10)} => ${state.getBalance(faucet.address).toString(10)}`);
        console.log(`    pay (receiver) ${account.value}: ${accountPrev.toString(10)} => ${state.getBalance(account).toString(10)}`);
    }
}

type EnsureCCC = (state: State) => Promise<void>;

async function initForLocal(state: State): Promise<EnsureCCC> {
    const FAUCET_SECRET = "ede1d4ccb4ec9a8bbbae9a13db3f4a7b56ea04189be86ac3a6a439d9a0a1addd";
    const FAUCET_ACCOUNT_ID = sdk.util.getAccountIdFromPrivate(FAUCET_SECRET);
    const FAUCET = {
        secret: H256.ensure(FAUCET_SECRET),
        accountId: FAUCET_ACCOUNT_ID,
        address: PlatformAddress.fromAccountId(FAUCET_ACCOUNT_ID, {networkId: "tc"}),
    };

    const ensure = (state: State) => ensureCCC(state, FAUCET, [REGULATOR, REGULATOR_ALT].concat(ACCOUNTS), 100000, 200000);

    await state.recover([FAUCET.address].concat([REGULATOR, REGULATOR_ALT]).concat(ACCOUNTS));
    await ensure(state);

    const randomPostfix = makeRandomString(5);

    const ASSET_SCHEMES: AssetScheme[] = [
        {name: "SCC1", supply: 1000000},
        {name: "SCC2", supply: 1000000},
        {name: "SCC3", supply: 1000000},
        {name: "SCC4", supply: 1000000},
        {name: "SCC5", supply: 1000000},
    ].map(({name, supply}) =>
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
        }));

    for (const assetScheme of ASSET_SCHEMES) {
        const action = new CreateAsset({
            regulator: REGULATOR,
            assetScheme
        });
        assert(() => action.valid(state));
        await action.sendApply(state);
    }

    return ensure;
}

async function initUsingIndexer(state: State): Promise<EnsureCCC> {
    const ensurer = (state: State) => ensureCCC(state, PSUEDO_FAUCET, [REGULATOR, REGULATOR_ALT].concat(ACCOUNTS), 1000, 2000);

    await state.recover([PSUEDO_FAUCET.address, REGULATOR, REGULATOR_ALT].concat(ACCOUNTS), ASSET_SCHEMES);
    await ensurer(state);
    for (const assetScheme of ASSET_SCHEMES) {
        const action = new CreateAsset({
            regulator: REGULATOR,
            assetScheme
        });
        if (!state.hasAssetScheme(action.tx.getAssetType())) {
            assert(() => action.valid(state));
            await action.sendApply(state);
        }
    }

    return ensurer;
}

async function main() {
    let state = new State();
    let ensureCCC: EnsureCCC;
    if (SERVER == "local") {
        ensureCCC = await initForLocal(state);
    } else {
        ensureCCC = await initUsingIndexer(state);
    }
    console.log();
    console.log("=== BEGIN SCENARIO ===");
    while(true) {
        console.log();
        const randomScenario = pickWeightedRandom(scenarios)!;
        console.log(`scenario ${randomScenario.scenario.name}`);

        const tx = await randomScenario.scenario(state);
        if (tx instanceof Skip) {
            console.warn(`skip: ${tx.reason}`);
            continue;
        }

        await tx.sendApply(state);

        state.printUtxos(...([REGULATOR, REGULATOR_ALT].concat(ACCOUNTS)));

        await ensureCCC(state);
    }
}

(async () => {
    await main().catch(error => console.log({error}));
})();