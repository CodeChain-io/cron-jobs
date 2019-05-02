import { SDK } from "codechain-sdk";
import { createEmail } from "./Email";
import { createSlack } from "./Slack";

export const SERVER: string = (() => {
    const server = process.env.SERVER || "corgi";
    if (["corgi", "mainnet"].indexOf(server) >= 0) {
        return server;
    } else {
        throw Error("Invalid server configuration");
    }
})();

function networkId(server: string): string {
    switch (server) {
        case "corgi":
            return "wc";
        case "mainnet":
            return "cc";
        default:
            throw Error("Invalid server configuration");
    }
}
function rpcUrl(server: string): string {
    switch (server) {
        case "corgi":
            return "https://corgi-rpc.codechain.io/";
        case "mainnet":
            return "https://rpc.codechain.io/";
        default:
            throw Error("Invalid server configuration");
    }
}

export const sdk = (() => {
    console.log(`sdk ${SERVER} ${process.env.RPC_URL}`);
    return new SDK({
        server: process.env.RPC_URL || rpcUrl(SERVER),
        networkId: networkId(SERVER),
    });
})();

export const slack = createSlack(`[${networkId(SERVER)}][fee-monitor]`, process.env.SLACK);
export const email = createEmail({
    tag: `[${networkId(SERVER)}][fee-monitor]`,
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    to: process.env.SENDGRID_TO,
});

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
