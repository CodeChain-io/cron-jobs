import { SDK } from "codechain-sdk";
import * as fs from "fs";

export function loadUsers(
    filename: string
): Promise<[string, string, string, string[]]> {
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
            if (users.length !== 63) {
                reject(
                    Error(
                        `There are ${
                            users.length
                        } users. The file may be corrupted.`
                    )
                );
                return;
            }
            const hourApprover = users.shift()!;
            const minuteApprover = users.shift()!;
            const secondApprover = users.shift()!;
            resolve([hourApprover, minuteApprover, secondApprover, users]);
        });
    });
}

export async function createUsers(
    sdk: SDK,
    passphrase?: string
): Promise<[string, string, string, string[]]> {
    const users = [];
    for (let i = 0; i < 60; i += 1) {
        const user = await sdk.key.createAssetTransferAddress({
            type: "P2PKH",
            passphrase
        });
        users.push(user.value);
    }
    const hourApprover = (await sdk.key.createPlatformAddress({
        passphrase
    })).value;
    const minuteApprover = (await sdk.key.createPlatformAddress({
        passphrase
    })).value;
    const secondApprover = (await sdk.key.createPlatformAddress({
        passphrase
    })).value;
    return [hourApprover, minuteApprover, secondApprover, users];
}

export function storeUsers(
    filename: string,
    hourApprover: string,
    minuteApprover: string,
    secondApprover: string,
    users: string[]
): Promise<null> {
    if (fs.existsSync(filename)) {
        throw Error(`${filename} already exists.`);
    }

    return new Promise((resolve, reject) => {
        const data = users.slice(0);
        data.unshift(secondApprover);
        data.unshift(minuteApprover);
        data.unshift(hourApprover);
        fs.writeFile(
            filename,
            JSON.stringify(data),
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
