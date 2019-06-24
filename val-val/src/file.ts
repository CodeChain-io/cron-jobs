import * as fs from "fs";

export const LAST_BLOCK_NUMBER = "./.lastBlockNumber";

function isFileExist(): Promise<boolean> {
    return new Promise(resolve => {
        fs.access(
            LAST_BLOCK_NUMBER,
            fs.constants.R_OK | fs.constants.W_OK,
            err => {
                if (err != null) {
                    resolve(false);
                    return;
                }
                resolve(true);
            }
        );
    });
}

// return true if the file is created
export async function createLastCheckedBlockIfNotExist(): Promise<boolean> {
    if (await isFileExist()) {
        return false;
    }
    return new Promise((resolve, reject) => {
        fs.writeFile(LAST_BLOCK_NUMBER, "0", "utf-8", err => {
            if (err != null) {
                reject(err);
                return;
            }
            resolve(true);
            return;
        });
    });
}

export function readLastCheckedBlock(): Promise<number> {
    return new Promise((resolve, reject) => {
        fs.readFile(LAST_BLOCK_NUMBER, "utf-8", (err, data) => {
            if (err != null) {
                reject(err);
                return;
            }
            if (data == null) {
                reject(Error(`${LAST_BLOCK_NUMBER} is empty`));
                return;
            }
            if (data === "") {
                reject(Error(`${LAST_BLOCK_NUMBER} is empty`));
                return;
            }
            try {
                resolve(parseInt(data, 10));
            } catch (err) {
                reject(err);
            }
        });
    });
}

export function writeLastCheckedBlock(blockNumber: number): Promise<void> {
    return new Promise((resolve, reject) => {
        fs.writeFile(
            LAST_BLOCK_NUMBER,
            blockNumber.toString(10),
            "utf-8",
            err => {
                if (err != null) {
                    reject(err);
                    return;
                }
                resolve();
                return;
            }
        );
    });
}
