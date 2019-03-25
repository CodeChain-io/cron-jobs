import { SDK } from "codechain-sdk";
import * as fs from "fs";
import { calculateSeq } from "../sendTx";
import { wait } from "./wait";

export function loadShardId(filename: string): Promise<number> {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filename)) {
            reject(Error(`${filename} not exists.`));
            return;
        }

        fs.readFile(filename, { encoding: "utf8" }, (err, data) => {
            if (err != null) {
                reject(err);
                return;
            }
            const shardId: number = JSON.parse(data);
            resolve(shardId);
        });
    });
}

export function storeShardId(filename: string, shardId: number): Promise<null> {
    if (fs.existsSync(filename)) {
        throw Error(`${filename} already exists.`);
    }

    return new Promise((resolve, reject) => {
        fs.writeFile(
            filename,
            JSON.stringify(shardId),
            { encoding: "utf-8", mode: 0o600 },
            err => {
                if (err != null) {
                    reject(err);
                    return;
                }
                resolve(null);
            }
        );
    });
}

export async function createShardId(
    sdk: SDK,
    payer: string,
    passphrase: string
): Promise<number> {
    const tx = sdk.core.createCreateShardTransaction({ users: [payer] });
    const seq = await calculateSeq(sdk, payer);
    const signed = await sdk.key.signTransaction(tx, {
        account: payer,
        passphrase,
        fee: 10,
        seq
    });
    const hash = await sdk.rpc.chain.sendSignedTransaction(signed);
    while (true) {
        const shardId = await sdk.rpc.chain.getShardIdByHash(hash);
        if (shardId == null) {
            console.log("CodeChain is creating a shard");
            await wait(1_000);
            continue;
        }
        return shardId;
    }
}
