import { CCCTracer, getCCCBalances } from "./CCC";
import { PlatformAddress, U64, Pay, UnwrapCCC, WrapCCC } from "codechain-sdk/lib/core/classes";
import { Custom } from "codechain-sdk/lib/core/transaction/Custom";
import { slack, email, sdk, MINIMUM_FEES, SERVER } from "./config";
import { getWeights, Weight, getStakeholders } from "./Stake";

function distribute(tracer: CCCTracer, author: PlatformAddress, weights: Weight[]) {
    const totalWeights = weights
        .map(({ weight }) => weight)
        .reduce((a, b) => a.plus(b), new U64(0));
    const totalMinFee = tracer.totalMinFee;
    let distributed = new U64(0);
    for (const { account, weight } of weights) {
        const fraction = totalMinFee.times(weight).idiv(totalWeights);
        distributed = distributed.plus(fraction);

        tracer.deposit(account, fraction);
    }
    tracer.deposit(author, tracer.totalFee.minus(distributed));
}

export async function checkBlockStatic(blockNumber: number) {
    const block = (await sdk.rpc.chain.getBlock(blockNumber))!;
    let tracer = new CCCTracer();
    let txTypes = block.transactions.map(tx => tx.unsigned.type()).join(", ");
    console.log(`TxTypes: ${txTypes}`);
    for (const signedTransaction of block.transactions) {
        const tx = signedTransaction.unsigned;

        const signer = PlatformAddress.fromPublic(signedTransaction.getSignerPublic(), {
            networkId: sdk.networkId,
        });
        const fee = tx.fee()!;
        const minFee = new U64(MINIMUM_FEES[tx.type()]);
        tracer.withdraw(signer, fee);
        tracer.collect(fee, minFee);

        if (tx instanceof Pay) {
            interface PayBody {
                receiver: PlatformAddress;
                quantity: U64;
            }
            let { receiver, quantity }: PayBody = tx as any;
            tracer.withdraw(signer, quantity);
            tracer.deposit(receiver, quantity);
        } else if (tx instanceof WrapCCC) {
            interface WrapCCCBody {
                payer: PlatformAddress;
                quantity: U64;
            }
            let { payer, quantity }: WrapCCCBody = tx as any;
            tracer.withdraw(payer, quantity);
        } else if (tx instanceof UnwrapCCC) {
            interface UnwrapCCCBody {
                _transaction: {
                    receiver: PlatformAddress;
                    burn: {
                        prevOut: { quantity: U64 };
                    };
                };
            }
            let {
                _transaction: {
                    receiver,
                    burn: {
                        prevOut: { quantity },
                    },
                },
            }: UnwrapCCCBody = tx as any;
            tracer.deposit(receiver, quantity);
        } else if (tx instanceof Custom) {
            console.error("Custom not supported yet");
        }
    }

    const author = block.author;
    const weights = await getWeights(blockNumber);

    distribute(tracer, author, weights);

    let aggregated = {
        server: SERVER,
        blockNumber,
        errors: [] as any[],
    };

    const authorBefore = await sdk.rpc.chain.getBalance(author, blockNumber - 1);
    const authorAfter = await sdk.rpc.chain.getBalance(author, blockNumber);

    if (!tracer.adjust(author, authorBefore).eq(authorAfter)) {
        const error = {
            type: "author",
            account: author.value,
            expected: tracer.adjust(author, authorBefore).toString(10),
            actual: authorAfter.toString(10),
        };
        console.error(error);
        aggregated.errors.push(error);
    }

    const stakeholders = await getStakeholders(blockNumber);
    const stakeholderBefores = await getCCCBalances(stakeholders, blockNumber - 1);
    const stakeholderAfters = await getCCCBalances(stakeholders, blockNumber);

    for (const stakeholder of stakeholders) {
        const expected = tracer.adjust(stakeholder, stakeholderBefores.get(stakeholder.value)!);
        const actual = stakeholderAfters.get(stakeholder.value)!;
        if (!expected.eq(actual)) {
            const error = {
                type: "stakeholder",
                account: stakeholder.value,
                expected,
                actual,
            };
            console.error(error);
            aggregated.errors.push(error);
        }
    }
    if (aggregated.errors.length > 0) {
        slack.sendWarning(JSON.stringify(aggregated, null, "    "));
        const errors = aggregated.errors
            .map(error => `<li>${JSON.stringify(error)}</li>`)
            .join("<br />\r\n");
        email.sendWarning(`
        <p>block number: ${aggregated.blockNumber}</p>
        <ul>${errors}</ul>
        `);
    } else {
        console.log("Block is Okay");
    }
}
