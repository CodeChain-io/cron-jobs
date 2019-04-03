import { U64 } from "codechain-primitives/lib";
import { SDK } from "codechain-sdk";
import * as readline from "readline";

import { PSUEDO_FAUCET } from "../src/configs";
import { checkTransaction } from "../src/util";

const genesis = "wccqx6n79wgvye8l8rx49xuqvm3vtwkffz28sff8axv";
const sdk = new SDK({
    server: "http://13.124.96.177:8080",
    networkId: "wc",
    keyStoreType: {
        type: "local",
        path: "./genesisKeyStore.db",
    },
});

async function main() {
    const tx = sdk.core.createPayTransaction({
        recipient: PSUEDO_FAUCET.platformAddress,
        quantity: U64.ensure(100000000),
    });

    const passphrase = await getPassphrase();
    const seq = await sdk.rpc.chain.getSeq(genesis);
    const fee = 100;
    const signedTx = await sdk.key.signTransaction(tx, {
        account: genesis,
        passphrase,
        seq,
        fee,
    });
    const hash = await sdk.rpc.chain.sendSignedTransaction(signedTx);
    console.log("hash", hash);
    await checkTransaction(hash);
}

async function getPassphrase(): Promise<string> {
    const rl = readline.createInterface(process.stdin, process.stdout);
    try {
        const promise = new Promise<string>(resolve => {
            rl.question(`password for ${genesis}\n> `, resolve);
        });
        return await promise;
    } finally {
        rl.close();
    }
}

(async () => {
    await main().catch(error => {
        console.log({ error });
    });
})();
