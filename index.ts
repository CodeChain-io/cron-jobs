import {H256, H256Value, U64, U64Value} from "codechain-primitives";
import {AssetScheme} from "codechain-sdk/lib/core/classes";
import {PlatformAddress} from "codechain-primitives/lib";

import {ACCOUNTS, ASSET_SCHEMES, PSUEDO_FAUCET, REGULATOR, REGULATOR_ALT, sdk, SERVER} from "./configs";
import {TxSender} from "./TxSender";
import {State} from "./State";
import {CreateAsset} from "./actions/CreateAsset";
import {assert, makeRandomString, sleep} from "./util";
import {airdrop_any_10} from "./scenario";

async function ensureCCC(state: State, faucet: { secret: H256, address: PlatformAddress }, accounts: PlatformAddress[], threshold: U64Value) {
    const poors = accounts
        .map<[PlatformAddress, U64]>(account => [account, state.getBalance(account)])
        .filter(([account, balance]) => balance.isLessThan(threshold));

    for (const [account, balance] of poors) {
        const toGive = U64.ensure(threshold).minus(balance);

        const sendTx = new TxSender(faucet.secret,
            sdk.core.createPayTransaction({
                recipient: account,
                quantity: U64.ensure(toGive),
            }));
        await sendTx.sendApplyFee(state);

        const faucetPrev = state.modifyBalance(faucet.address, existing => existing.minus(toGive));
        const accountPrev = state.modifyBalance(account, existing => existing.plus(toGive));

        console.log(`pay (sender) ${faucet.address.value}: ${faucetPrev.toString(10)} => ${state.getBalance(faucet.address).toString(10)}`);
        console.log(`pay (receiver) ${account.value}: ${accountPrev.toString(10)} => ${state.getBalance(account).toString(10)}`);
    }
}

async function initForLocal(state: State) {
    const FAUCET_SECRET = "ede1d4ccb4ec9a8bbbae9a13db3f4a7b56ea04189be86ac3a6a439d9a0a1addd";
    const FAUCET_ACCOUNT_ID = sdk.util.getAccountIdFromPrivate(FAUCET_SECRET);
    const FAUCET = {
        secret: H256.ensure(FAUCET_SECRET),
        accountId: FAUCET_ACCOUNT_ID,
        address: PlatformAddress.fromAccountId(FAUCET_ACCOUNT_ID, {networkId: "tc"}),
    };

    await state.recover([FAUCET.address].concat([REGULATOR, REGULATOR_ALT]).concat(ACCOUNTS));
    await ensureCCC(state, FAUCET, [REGULATOR, REGULATOR_ALT].concat(ACCOUNTS), 100000);

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
}

async function initUsingIndexer(state: State) {
    await state.recover([PSUEDO_FAUCET.address, REGULATOR, REGULATOR_ALT].concat(ACCOUNTS), ASSET_SCHEMES);
    await ensureCCC(state, PSUEDO_FAUCET, [REGULATOR, REGULATOR_ALT].concat(ACCOUNTS), 1000);

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
}

async function main() {
    let state = new State();
    if (SERVER == "local") {
        await initForLocal(state);
    } else {
        await initUsingIndexer(state);
    }

    console.log("=== BEGIN SCENARIO ===");
    while(true) {
        const tx = await airdrop_any_10(state);
        await tx.sendApply(state);
        state.printUtxos(...([REGULATOR, REGULATOR_ALT].concat(ACCOUNTS)));
        sleep(1.0);
    }
}

(async () => {
    await main().catch(error => console.log({error}));
})();