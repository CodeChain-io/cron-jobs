import { SDK } from "codechain-sdk";
import { createSlack } from "./Slack";

export const SERVER: string = (() => {
    const server = process.env.SERVER || "corgi";
    if (["corgi", "mainnet"].indexOf(server) >= 0) {
        return server;
    } else {
        throw Error("Invalid server configuration");
    }
})();

export const sdk = (() => {
    console.log(`sdk ${SERVER} ${process.env.RPC_URL}`);
    switch (SERVER) {
        case "corgi":
            return new SDK({
                server: process.env.RPC_URL || "https://corgi-rpc.codechain.io/",
                networkId: "wc",
            });
        case "mainnet":
            return new SDK({
                server: process.env.RPC_URL || "https://rpc.codechain.io/",
                networkId: "cc",
            });
        default:
            throw Error("Invalid server configuration");
    }
})();

export const slack = createSlack(`fee-monitor (${SERVER})`, process.env.SLACK);

export const MINIMUM_FEES: { [param: string]: number } = {
    pay: 100,
    setRegularKey: 10000,
    createShard: 1000000,
    setShardOwners: 100000,
    setShardUsers: 10000,
    wrapCCC: 100000,
    custom: 0,
    store: 5000,
    remove: 5000,
    mintAsset: 100000,
    transferAsset: 100,
    changeAssetScheme: 100000,
    increaseAssetSupply: 100000,
    composeAsset: 100000,
    decomposeAsset: 100000,
    unwrapCCC: 100,
};
