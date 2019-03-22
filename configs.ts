import {PlatformAddress, U64} from "codechain-primitives/lib";
import {SDK} from "codechain-sdk";
import {AssetScheme} from "codechain-sdk/lib/core/classes";
import {KeyStore} from "codechain-sdk/lib/key/KeyStore";

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
        case "local": return new SDK({
            server: "http://127.0.0.1:8080",
            networkId: "tc",
        });
        case "corgi": return new SDK({
            server: "http://13.124.96.177:8080",
            networkId: "wc",
        });
        default: throw Error("Invalid server configuration");
    }
})();

export const localKeyStore: Promise<KeyStore> = sdk.key.createLocalKeyStore();

// tccqy7lfe4tx80r9tpdpqrk8tfsvlkefnh04v75amvp
export const REGULATOR: PlatformAddress =
    PlatformAddress.fromAccountId("3df4e6ab31de32ac2d080763ad3067ed94ceefab", { networkId: sdk.networkId });
// tccq957zg9360axnv6vpkdgrfu80nhhfgqqmsk28l26
export const REGULATOR_ALT: PlatformAddress =
    PlatformAddress.fromAccountId("69e120b1d3fa69b34c0d9a81a7877cef74a000dc", { networkId: sdk.networkId });
export const ACCOUNTS: PlatformAddress[] = [
    "e17ff439706c7ee9b3de76615fdd648b1d327640", // tccq8shlapewpk8a6dnmemxzh7avj936vnkgq54m7cd
    "6ada20402ef76234cbba1b80ce841bad1d68f30b", // tccq94d5gzq9mmkydxthgdcpn5yrwk3668npvpd9pe0
    "61e81175e52e0cd519e72d5afbe08a65eadd38da", // tccq9s7syt4u5hqe4geuuk447lq3fj74hfcmgm9vv08
    "69845440b69b324fb560879866d539a482c0e3b8", // tccq95cg4zqk6dnyna4vzresek48xjg9s8rhq67cvt7
    "d2ac58696662c08ee37b2d9e5ac3bde3b14f8dfe", // tccq8f2ckrfve3vprhr0vkeukkrhh3mznudlckp6kqq
    "457f3c295de54a1044197563c47a20347daa0a23", // tccq9zh70pfthj55yzyr96k83r6yq68m2s2yv8dqgxp
    "ecc6aba091aa62a56bda65b7ec270b55d5798175", // tccq8kvd2aqjx4x9fttmfjm0mp8pd2a27vpw53j2jhh
    "67a88eab5e26be65a4c9671fa445caeaacd78e72", // tccq9n63r4ttcntuedye9n3lfz9et42e4uwwged7vhp
    "e419a134b85f941416edec82d7bafbfe837c9ab2", // tccq8jpngf5hp0eg9qkahkg94a6l0lgxly6kgks2a25
    "50c9360a5ae6b4e1c98fd61924aeb86e56f085e2", // tccq9gvjds2ttntfcwf3ltpjf9whph9duy9ug4tk64r
    "fecc099b610ca5c3feec6dd5c53de9d0b20936b9", // tccq8lvczvmvyx2tsl7a3kat3faa8gtyzfkhycx29ls
].map(accountId => PlatformAddress.fromAccountId(accountId, { networkId: sdk.networkId }));

export const ASSET_SCHEMES: AssetScheme[] = [
    {name: "SCC1", supply: 1000000},
    {name: "SCC2", supply: 1000000},
    {name: "SCC3", supply: 1000000},
    {name: "SCC4", supply: 1000000},
    {name: "SCC5", supply: 1000000},
].map(({name, supply}) => {
    const postfix = process.env.POSTFIX;
    if (postfix) {
        var fullName = `${name}-${postfix}`
    } else {
        var fullName = name;
    }
    return new AssetScheme({
        networkId: sdk.networkId,
        shardId: 0,
        registrar: REGULATOR,
        approver: null,
        allowedScriptHashes: [],
        pool: [],
        supply: U64.ensure(supply),
        metadata: JSON.stringify({
            name: fullName,
        }),
    })
});