import { SDK } from "codechain-sdk";
import * as fs from "fs";

export function loadUsers(filename: string): Promise<string[]> {
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
            const users: string[] = JSON.parse(data);
            if (users.length !== 60) {
                reject(
                    Error(
                        `There are ${
                            users.length
                        } users. The file may be corrupted.`
                    )
                );
                return;
            }
            resolve(users);
        });
    });
}

export async function createUsers(
    sdk: SDK,
    passphrase?: string
): Promise<string[]> {
    const users = [];
    for (let i = 0; i < 60; i += 1) {
        const user = await sdk.key.createAssetTransferAddress({
            type: "P2PKH",
            passphrase
        });
        users.push(user.value);
    }
    return users;
}

export function storeUsers(filename: string, users: string[]): Promise<null> {
    if (fs.existsSync(filename)) {
        throw Error(`${filename} already exists.`);
    }

    return new Promise((resolve, reject) => {
        fs.writeFile(
            filename,
            JSON.stringify(users),
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
