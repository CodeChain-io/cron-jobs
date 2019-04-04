#!/usr/bin/env node

import { SDK } from "codechain-sdk";
import { get } from "config";

function wait(timeout: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
}

function getConfig(field: string): string {
    const value = get<string>(field);
    if (value == null) {
        throw Error(`No ${field}`);
    }
    return value;
}

const defaultFee = 100;
const defaultQuantity = 100;

async function main() {
    const leftAddress = getConfig("left.address");
    const leftPassphrase = getConfig("left.passphrase");
    const rightAddress = getConfig("right.address");
    const rightPassphrase = getConfig("right.passphrase");

    const networkId = getConfig("network");
    const server = getConfig("server");

    const sdk = new SDK({ server, networkId });

    let isLeftTurn = true;

    let previousBlockNumber = await sdk.rpc.chain.getBestBlockNumber();

    const leftBalance = await sdk.rpc.chain.getBalance(
        leftAddress,
        previousBlockNumber
    );
    const rightBalance = await sdk.rpc.chain.getBalance(
        rightAddress,
        previousBlockNumber
    );

    if (leftBalance.isLessThan(500)) {
        if (rightBalance.isLessThan(500)) {
            throw Error(
                `Not enough balance to juggle. left: ${
                    leftBalance.value
                } right: ${rightBalance.value}`
            );
        }
        isLeftTurn = false;
    }

    while (true) {
        const address = isLeftTurn ? leftAddress : rightAddress;
        const recipient = isLeftTurn ? rightAddress : leftAddress;
        const passphrase = isLeftTurn ? leftPassphrase : rightPassphrase;

        const currentBlockNumber = await sdk.rpc.chain.getBestBlockNumber();
        if (currentBlockNumber <= previousBlockNumber) {
            console.error("Wait 3 seconds");
            await wait(3_000);
            continue;
        }
        previousBlockNumber = currentBlockNumber;

        const seq = await sdk.rpc.chain.getSeq(address, currentBlockNumber);
        const currentBalance = await sdk.rpc.chain.getBalance(
            address,
            currentBlockNumber
        );
        if (currentBalance.isLessThan(500)) {
            const oppositeBalance = await sdk.rpc.chain.getBalance(
                recipient,
                currentBlockNumber
            );
            if (oppositeBalance.isLessThan(500)) {
                const left = isLeftTurn ? currentBalance : oppositeBalance;
                const right = isLeftTurn ? oppositeBalance : currentBalance;
                throw Error(
                    `Too less balance on both address. left: ${
                        left.value
                    } right: ${right.value}`
                );
            }
            isLeftTurn = !isLeftTurn;
            continue;
        }

        const fee = Math.max(
            Math.floor(Math.random() * 3 * defaultFee),
            defaultFee
        );
        const quantity = Math.floor(Math.random() * 10 * defaultQuantity);

        const tx = sdk.core.createPayTransaction({ recipient, quantity });
        const signed = await sdk.key.signTransaction(tx, {
            account: address,
            passphrase,
            fee,
            seq
        });

        try {
            const hash = await sdk.rpc.chain.sendSignedTransaction(signed);
            console.log(`${hash} sent`);
        } catch (ex) {
            console.error(`Cannot send ${address}:${seq}: ${ex.message}`);
        }

        isLeftTurn = !isLeftTurn;

        await wait(10_000);
    }
}

if (typeof require !== "undefined" && require.main === module) {
    main().catch(console.error);
}
