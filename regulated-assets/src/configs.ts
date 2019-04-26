import { H160, H256, PlatformAddress, U64 } from "codechain-primitives/lib";
import { SDK } from "codechain-sdk";
import { AssetScheme } from "codechain-sdk/lib/core/classes";
import { KeyStore } from "codechain-sdk/lib/key/KeyStore";
import { createSlack } from "./Slack";

export const SERVER: string = (() => {
    const server = process.env.SERVER || "local";
    if (["local", "corgi"].indexOf(server) >= 0) {
        return server;
    } else {
        throw Error("Invalid server configuration");
    }
})();
export const INDEXER_URL = "https://corgi.codechain.io/explorer";
export const sdk = (() => {
    switch (SERVER) {
        case "local":
            return new SDK({
                server: process.env.RPC_URL || "http://127.0.0.1:8080",
                networkId: "tc",
            });
        case "corgi":
            return new SDK({
                server: process.env.RPC_URL || "https://corgi-rpc.codechain.io/",
                networkId: "wc",
            });
        default:
            throw Error("Invalid server configuration");
    }
})();

export const localKeyStore: Promise<KeyStore> = sdk.key.createLocalKeyStore();

const FAUCET_SECRET = "3f3a6a9efc7a0435b32096ea1debdbc77481dc069c65cfefe698aa243845f0cd";
// tccq9fsvu9pl8auufard59055e6zxu0gzascqsvpsjt
// wccq9fsvu9pl8auufard59055e6zxu0gzascqx24a6y
const FAUCET_ACCOUNT_ID = sdk.util.getAccountIdFromPrivate(FAUCET_SECRET);
export const PSUEDO_FAUCET = {
    secret: H256.ensure(FAUCET_SECRET),
    accountId: H160.ensure(FAUCET_ACCOUNT_ID),
    platformAddress: PlatformAddress.fromAccountId(FAUCET_ACCOUNT_ID, {
        networkId: sdk.networkId,
    }),
};

export const REGULATOR = {
    // tccq90v3qsvtpt72nv09ngg8ntdwcul6paa6ux6gmnl
    platformAddress: PlatformAddress.fromAccountId("5ec8820c5857e54d8f2cd083cd6d7639fd07bdd7", {
        networkId: sdk.networkId,
    }),
    // tcaqyqemdrkpgxnqd352dh0j6grec8f5fzg9a6s0x8ug9
    accountId: H160.ensure("9db4760a0d303634536ef96903ce0e9a24482f75"),
};

export const REGULATOR_ALT = {
    // tccq88kk349wm2nvffnusvqhh4g6zr9fxxu75xaxpgp
    platformAddress: PlatformAddress.fromAccountId("cf6b46a576d5362533e4180bdea8d0865498dcf5", {
        networkId: sdk.networkId,
    }),
    // tcaqyql0kalwjhey7ge4euq8f63lzfskk7ejn7qmxy6rm
    accountId: H160.ensure("f7dbbf74af927919ae7803a751f8930b5bd994fc"),
};

export const PLATFORM_ADDRESSES: PlatformAddress[] = [
    "d390b492e7121bba6a7243dc0d7031c6e2375b75", // tccq8fepdyjuufphwn2wfpacrtsx8rwyd6mw5jyc2cc
    "d16bf365af3b73fc05b8d2fbd1a919f1b7e1245f", // tccq8gkhum94uah8lq9hrf0h5dfr8cm0cfytuu54ag8
    "0a2d89d2856489abe3047c3acc5d86f1510158bc", // tccqy9zmzwjs4jgn2lrq37r4nzasmc4zq2chst55vns
].map(accountId => PlatformAddress.fromAccountId(accountId, { networkId: sdk.networkId }));

export const ASSET_ACCOUNTS: H160[] = [
    "9b6305ba085f658dcc8ce09293b3270646d6395a", // tcaqyqekcc9hgy97evdejxwpy5nkvnsv3kk89dqa8uv47
    "55e25d9f0e977ac4817e186a2ded6b87fee178e5", // tcaqyq4tcjanu8fw7kys9lps63da44c0lhp0rjszhtaey
    "f53316adb96b1bd85f7ae7c5f29f39d799288b4b", // tcaqyql2vck4kukkx7ctaaw030jnuua0xfg3d9swk3plr
    "2df658920a663db06dd5c042623bef4852ecef7c", // tcaqyqjmajcjg9xv0dsdh2uqsnz80h5s5hvaa7qugl0gt
    "9df2f9e12013050d433859a442c285e7ef716130", // tcaqyqemuheuyspxpgdgvu9nfzzc2z70mm3vycqutehka
].map(H160.ensure);

export const PROTO_ASSET_SCHEME = [
    { name: "SCC1", supply: 1000000 },
    { name: "SCC2", supply: 1000000 },
    { name: "SCC3", supply: 1000000 },
    { name: "SCC4", supply: 1000000 },
    { name: "SCC5", supply: U64.MAX_VALUE },
];

export const ASSET_SCHEMES: AssetScheme[] = PROTO_ASSET_SCHEME.map(({ name, supply }) => {
    const postfix = process.env.POSTFIX;
    let fullName: string;
    if (postfix) {
        fullName = `${name}-${postfix}`;
    } else {
        fullName = name;
    }
    return new AssetScheme({
        networkId: sdk.networkId,
        shardId: 0,
        registrar: REGULATOR.platformAddress,
        approver: null,
        allowedScriptHashes: [],
        pool: [],
        supply: U64.ensure(supply),
        metadata: JSON.stringify({
            name: fullName,
        }),
    });
});

export const FEE: { [txType: string]: U64 } = (() => {
    switch (SERVER) {
        case "local":
            return {
                ChangeAssetScheme: new U64(10),
                MintAsset: new U64(10),
                IncreaseAssetSupply: new U64(10),
                TransferAsset: new U64(10),
                Pay: new U64(10),
            };
        case "corgi":
            return {
                ChangeAssetScheme: new U64(100000),
                MintAsset: new U64(100000),
                IncreaseAssetSupply: new U64(100000),
                TransferAsset: new U64(100),
                Pay: new U64(100),
            };
        default:
            throw Error("Invalid server configuration");
    }
})();

export const TIMEOUT: number = (() => {
    switch (SERVER) {
        case "local":
            return 1.0;
        case "corgi":
            return 30.0;
        default:
            throw Error("Invalid server configuration");
    }
})();

export const slack = createSlack(process.env.SLACK);
