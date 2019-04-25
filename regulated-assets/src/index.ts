import { H256, U64, U64Value } from "codechain-primitives";
import { H160, PlatformAddress } from "codechain-primitives/lib";
import { AssetScheme } from "codechain-sdk/lib/core/classes";
import * as fs from "fs";

import { CreateAsset } from "./actions/CreateAsset";
import {
    ASSET_ACCOUNTS,
    ASSET_SCHEMES,
    PLATFORM_ADDRESSES,
    PROTO_ASSET_SCHEME,
    PSUEDO_FAUCET,
    REGULATOR,
    REGULATOR_ALT,
    sdk,
    SERVER,
    slack,
} from "./configs";
import { scenarios, Skip } from "./scenario";
import { State } from "./State";
import { TxSender } from "./TxSender";
import { assert, makeRandomString, pickWeightedRandom, sleep, time } from "./util";
import { Watchdog } from "watchdog";

async function ensureCCC(
    state: State,
    faucet: { secret: H256; platformAddress: PlatformAddress },
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

        const faucetPrev = state.modifyBalance(faucet.platformAddress, existing =>
            existing.minus(toGive),
        );
        const accountPrev = state.modifyBalance(account, existing => existing.plus(toGive));
        console.group();
        console.log(
            `pay (sender) ${faucet.platformAddress.value}: ${faucetPrev.toString(10)}` +
                ` => ${state.getBalance(faucet.platformAddress).toString(10)}`,
        );
        console.log(
            `pay (receiver) ${account.value}: ${accountPrev.toString(10)}` +
                ` => ${state.getBalance(account).toString(10)}`,
        );
        console.groupEnd();
    }
}

type EnsureCCC = (state: State) => Promise<void>;

async function initForLocal(state: State): Promise<EnsureCCC> {
    const FAUCET_SECRET = "ede1d4ccb4ec9a8bbbae9a13db3f4a7b56ea04189be86ac3a6a439d9a0a1addd";
    const FAUCET_ACCOUNT_ID = sdk.util.getAccountIdFromPrivate(FAUCET_SECRET);
    const FAUCET = {
        secret: H256.ensure(FAUCET_SECRET),
        accountId: H160.ensure(FAUCET_ACCOUNT_ID),
        platformAddress: PlatformAddress.fromAccountId(FAUCET_ACCOUNT_ID, {
            networkId: "tc",
        }),
    };

    const ensure = (st: State) =>
        ensureCCC(
            st,
            FAUCET,
            [REGULATOR, REGULATOR_ALT].map(x => x.platformAddress).concat(PLATFORM_ADDRESSES),
            100000,
            200000,
        );
    await state.recover(
        [FAUCET, REGULATOR, REGULATOR_ALT].map(x => x.platformAddress).concat(PLATFORM_ADDRESSES),
        [REGULATOR, REGULATOR_ALT].map(x => x.accountId).concat(ASSET_ACCOUNTS),
    );
    await ensure(state);

    const randomPostfix = makeRandomString(5);
    const tempAssetSchemes: AssetScheme[] = PROTO_ASSET_SCHEME.map(
        ({ name, supply }) =>
            new AssetScheme({
                networkId: sdk.networkId,
                shardId: 0,
                registrar: REGULATOR.platformAddress,
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
            regulator: REGULATOR.platformAddress,
            recipient: REGULATOR.accountId,
            assetScheme,
        });
        assert(() => action.valid(state));
        await action.sendApply(state);
    }

    return ensure;
}

async function initUsingIndexer(state: State): Promise<EnsureCCC> {
    const ensurer = (st: State) =>
        ensureCCC(
            st,
            PSUEDO_FAUCET,
            [REGULATOR, REGULATOR_ALT].map(x => x.platformAddress).concat(PLATFORM_ADDRESSES),
            10000000,
            20000000,
        );

    await state.recover(
        [PSUEDO_FAUCET, REGULATOR, REGULATOR_ALT]
            .map(x => x.platformAddress)
            .concat(PLATFORM_ADDRESSES),
        [REGULATOR, REGULATOR_ALT].map(x => x.accountId).concat(ASSET_ACCOUNTS),
        ASSET_SCHEMES,
    );
    await ensurer(state);
    for (const assetScheme of ASSET_SCHEMES) {
        const action = new CreateAsset({
            regulator: REGULATOR.platformAddress,
            recipient: REGULATOR.accountId,
            assetScheme,
        });
        if (!state.hasAssetScheme(action.tx.getAssetType())) {
            assert(() => action.valid(state));
            await action.sendApply(state);
        }
    }

    return ensurer;
}

interface Progress {
    description: string;
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
    const dog = new Watchdog<Progress>(30 * 1000); // 30 seconds
    dog.on("reset", ({ data }, _) => {
        const message =
            "regulated-assets has been stalled for 30 seconds:" +
            JSON.stringify(data, null, "    ");
        console.warn(message);
        slack.sendError(message);
    });
    for (;;) {
        console.log();
        const picked = pickWeightedRandom(Object.values(scenarios))!;
        console.log(`scenario ${picked.description}`);
        dog.feed({
            data: {
                description: picked.description,
            },
        });
        const scenario = await time("create scenario", () => picked.scenario(state));
        if (scenario instanceof Skip) {
            console.warn(`skip: ${scenario.reason}`);
            continue;
        } else if (scenario instanceof Array) {
            for (const s of scenario) {
                await s.action.sendApply(state, s.expected);
            }
        } else {
            await scenario.action.sendApply(state, scenario.expected);
        }

        state.printUtxos(...[REGULATOR.accountId, REGULATOR_ALT.accountId].concat(ASSET_ACCOUNTS));
        await sleep(1.0);
        await ensureAmountOfCCC(state);
    }
}

(async () => {
    await main().catch(error => {
        console.log({ error });
        slack.sendError(error);
        if (fs.existsSync("./corgi.log")) {
            slack.sendAttachments(
                `corgi.${new Date().toISOString()}.log`,
                (fs.readFileSync("./corgi.log") || "").toString(),
            );
        }
    });
})();
