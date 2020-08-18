import { SDK } from "codechain-sdk";
import * as fs from "fs";

export function loadApprovers(
    filename: string
): Promise<[string, string, string]> {
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
            const approvers: string[] = JSON.parse(data);
            if (approvers.length !== 3) {
                reject(
                    Error(
                        `There are ${approvers.length} users. The file may be corrupted.`
                    )
                );
                return;
            }
            resolve(approvers as [string, string, string]);
        });
    });
}

export async function createApprovers(
    sdk: SDK,
    passphrase?: string
): Promise<[string, string, string]> {
    const hourApprover = (
        await sdk.key.createPlatformAddress({
            passphrase
        })
    ).value;
    const minuteApprover = (
        await sdk.key.createPlatformAddress({
            passphrase
        })
    ).value;
    const secondApprover = (
        await sdk.key.createPlatformAddress({
            passphrase
        })
    ).value;
    return [hourApprover, minuteApprover, secondApprover];
}

export function storeApprovers(
    filename: string,
    hourApprover: string,
    minuteApprover: string,
    secondApprover: string
): Promise<null> {
    if (fs.existsSync(filename)) {
        throw Error(`${filename} already exists.`);
    }

    return new Promise((resolve, reject) => {
        const data = [hourApprover, minuteApprover, secondApprover];
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
