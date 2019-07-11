import { CCCTracer, getCCCBalances, SettleMoment } from "./CCC";
import { slack, email, sdk, SERVER } from "./config";
import {
    PlatformAddress,
    U64,
    Block,
    WrapCCC,
    UnwrapCCC,
    Pay,
} from "codechain-sdk/lib/core/classes";
import { Custom } from "codechain-sdk/lib/core/transaction/Custom";
import { getWeights, Weight, getStakeholders, getValidators } from "./Stake";
import { SignedTransaction } from "codechain-sdk/lib/core/SignedTransaction";
import { MinimumFees } from "./CommonParams";
import * as RLP from "rlp";

export interface DynamicParams {
    termSeconds: number;
    minimumFees: MinimumFees;
}

interface TermData {
    intermediateReward: CCCTracer;
    commitedVotesPerValidator: Map<string, number>;
    assembledVotesPerAuthor: Map<string, [number, number]>;
}

interface AggregatedErrors {
    server: string;
    moment: SettleMoment;
    errors: any[];
}

function distributeDynamic(
    tracerForImmedateSettle: CCCTracer,
    tracerForNextTermSettle: CCCTracer,
    author: PlatformAddress,
    weights: Weight[],
) {
    const totalWeights = weights
        .map(({ weight }) => weight)
        .reduce((a, b) => a.plus(b), new U64(0));
    const totalMinFee = tracerForImmedateSettle.totalMinFee;
    let distributed = new U64(0);
    for (const { account, weight } of weights) {
        const fraction = totalMinFee.times(weight).idiv(totalWeights);
        distributed = distributed.plus(fraction);

        tracerForImmedateSettle.deposit(account, fraction);
    }
    tracerForNextTermSettle.deposit(author, tracerForImmedateSettle.totalFee.minus(distributed));
}

function setBitIndices(bitset: number[], validatorCount: number): number[] {
    const indices: number[] = [];
    for (let i = 0; i < validatorCount; i++) {
        const arrayIndex = Math.floor(i / 8);
        const bitIndex = i % 8;

        if ((bitset[arrayIndex] >> bitIndex) & 1) {
            indices.push(i);
        }
    }
    return indices;
}

function decodeBitsetField(encodedBitSet: number[]): number[] {
    const buffer = Buffer.from(encodedBitSet);
    const decoded = RLP.decode(buffer);

    return Array.from(decoded.values());
}

export class DynamicChecker {
    private parentTermValidators: string[] = [];
    private parentTermLastBlockNumber = 0;
    private parentTermFirstBlockNumber = 0;
    private parentBlockTimestamp = 0;
    private init = true;
    private tracerForImmedateSettle = new CCCTracer();
    private prevTermData: TermData = {
        intermediateReward: new CCCTracer(),
        commitedVotesPerValidator: new Map(),
        assembledVotesPerAuthor: new Map(),
    };
    private currentTermData: TermData = {
        intermediateReward: new CCCTracer(),
        commitedVotesPerValidator: new Map(),
        assembledVotesPerAuthor: new Map(),
    };
    public nominationDeposits: Map<string, U64> = new Map();

    public async checkBlockDynamic(blockNumber: number, dynamicParams: DynamicParams) {
        const block = (await sdk.rpc.chain.getBlock(blockNumber))!;
        const currentTimestamp = block.timestamp;

        if (this.init) {
            this.parentBlockTimestamp = currentTimestamp;
            this.parentTermLastBlockNumber = blockNumber - 1;
            this.init = false;
        }

        const currentBlockTermIndicator = Math.floor(currentTimestamp / dynamicParams.termSeconds);
        const parentBlockTermIndicator = Math.floor(
            this.parentBlockTimestamp / dynamicParams.termSeconds,
        );
        this.parentBlockTimestamp = currentTimestamp;

        this.handleTransactions(block.transactions, dynamicParams);

        const author = block.author;
        const weights = await getWeights(blockNumber);
        const validators = (await getValidators(blockNumber - 2)).reverse();
        await this.recordContribution(block, validators);
        distributeDynamic(
            this.tracerForImmedateSettle,
            this.currentTermData.intermediateReward,
            author,
            weights,
        );

        const immediateSettleMoment: SettleMoment = {
            tag: "block",
            value: blockNumber,
        };

        if (currentBlockTermIndicator !== parentBlockTermIndicator) {
            const blockRewardSettleMoment: SettleMoment = {
                tag: "term",
                value: blockNumber,
            };
            const totalReducedReward = await this.applyPenalty(
                this.parentTermValidators,
                blockNumber,
            );
            this.applyAdditionalRewards(this.parentTermValidators, totalReducedReward);
            await this.checkForValidators(blockNumber, blockRewardSettleMoment);
            await this.checkForStakeHolders(blockNumber, immediateSettleMoment, true);
            this.finalizeTerm(blockNumber, validators);
        } else {
            await this.checkForStakeHolders(blockNumber, immediateSettleMoment, false);
        }
        this.tracerForImmedateSettle = new CCCTracer();
    }

    private async checkForValidators(currentBlockNumber: number, settleMoment: SettleMoment) {
        const errorsOfValidators: AggregatedErrors = {
            server: SERVER,
            moment: settleMoment,
            errors: [] as any[],
        };

        for (const validator of this.parentTermValidators) {
            const validatorBefore = await sdk.rpc.chain.getBalance(
                validator,
                currentBlockNumber - 1,
            );
            const validatorAfter = await sdk.rpc.chain.getBalance(validator, currentBlockNumber);
            const settleStakeHolderReward = this.tracerForImmedateSettle.adjust(
                PlatformAddress.fromString(validator),
                validatorBefore,
            );
            const expected = this.prevTermData.intermediateReward.adjust(
                PlatformAddress.fromString(validator),
                settleStakeHolderReward,
            );
            if (!expected.eq(validatorAfter)) {
                const error = {
                    type: "validator",
                    account: validator,
                    expected: expected.toString(10),
                    actual: validatorAfter.toString(10),
                };
                console.error(error);
                errorsOfValidators.errors.push(error);
            }
        }
        this.reportError(errorsOfValidators);
    }

    private async checkForStakeHolders(
        blockNumber: number,
        settleMoment: SettleMoment,
        isTermChanged: boolean,
    ) {
        const stakeholders = await getStakeholders(blockNumber);
        const stakeholderBefores = await getCCCBalances(stakeholders, blockNumber - 1);
        const stakeholderAfters = await getCCCBalances(stakeholders, blockNumber);

        const errorsOfstakeHolders: AggregatedErrors = {
            server: SERVER,
            moment: settleMoment,
            errors: [] as any[],
        };

        for (const stakeholder of stakeholders) {
            const stakeholderBefore = this.tracerForImmedateSettle.adjust(
                stakeholder,
                stakeholderBefores.get(stakeholder.value)!,
            );
            const expected = isTermChanged
                ? this.prevTermData.intermediateReward.adjust(stakeholder, stakeholderBefore)
                : stakeholderBefore;
            const actual = stakeholderAfters.get(stakeholder.value)!;
            if (!expected.eq(actual)) {
                const error = {
                    type: "stakeholder",
                    account: stakeholder.value,
                    expected: expected.toString(10),
                    actual: actual.toString(10),
                };
                console.error(error);
                errorsOfstakeHolders.errors.push(error);
            }
        }
        this.reportError(errorsOfstakeHolders);
    }

    private handleTransactions(transactions: SignedTransaction[], dynamicParams: DynamicParams) {
        const txTypes = transactions.map(tx => tx.unsigned.type()).join(", ");
        console.log(`TxTypes: ${txTypes}`);
        for (const signedTransaction of transactions) {
            const tx = signedTransaction.unsigned;
            const signer = signedTransaction.getSignerAddress({
                networkId: sdk.networkId,
            });
            const fee = tx.fee()!;
            const minFee = new U64(dynamicParams.minimumFees[tx.type()]);
            this.tracerForImmedateSettle.withdraw(signer, fee);
            this.tracerForImmedateSettle.collect(fee, minFee);

            if (tx instanceof Pay) {
                interface PayBody {
                    receiver: PlatformAddress;
                    quantity: U64;
                }
                let { receiver, quantity }: PayBody = tx as any;
                this.tracerForImmedateSettle.withdraw(signer, quantity);
                this.tracerForImmedateSettle.deposit(receiver, quantity);
            } else if (tx instanceof WrapCCC) {
                interface WrapCCCBody {
                    payer: PlatformAddress;
                    quantity: U64;
                }
                let { payer, quantity }: WrapCCCBody = tx as any;
                this.tracerForImmedateSettle.withdraw(payer, quantity);
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
                this.tracerForImmedateSettle.deposit(receiver, quantity);
            } else if (tx instanceof Custom) {
                interface CustomBody {
                    handlerId: U64;
                    bytes: Buffer;
                }
                const { handlerId, bytes }: CustomBody = tx as any;
            }
        }
    }

    private reportError(aggregated: AggregatedErrors) {
        const positionString = `${aggregated.moment.tag}: ${aggregated.moment.value}`;

        if (aggregated.errors.length > 0) {
            slack.sendWarning(JSON.stringify(aggregated, null, "    "));
            const errors = aggregated.errors
                .map(error => `<li>${JSON.stringify(error)}</li>`)
                .join("<br />\r\n");
            email.sendWarning(`
            <p>${positionString}</p>
            <ul>${errors}</ul>
            `);
        } else {
            console.log(`${positionString} is Okay`);
        }
    }

    private finalizeTerm(blockNumber: number, currentTermValidators: string[]) {
        this.prevTermData = this.currentTermData;
        this.currentTermData = {
            intermediateReward: new CCCTracer(),
            assembledVotesPerAuthor: new Map(),
            commitedVotesPerValidator: new Map(),
        };

        this.parentTermFirstBlockNumber = this.parentTermLastBlockNumber + 1;
        this.parentTermLastBlockNumber = blockNumber;
        this.parentTermValidators = currentTermValidators;
    }

    /**
     * Distribute total reduced rewards following the rank of collected average votes per round.
     * @param validators previous term's validator.
     * @param totalReducedReward reduced reward earned by applying penalty.
     */
    private applyAdditionalRewards(validators: string[], totalReducedReward: U64) {
        const mapValidators: Map<number, string[]> = new Map();
        for (const validator of validators) {
            const [missed, proposed] = this.prevTermData.assembledVotesPerAuthor.get(validator) || [
                0,
                0,
            ];
            if (proposed !== 0) {
                const ratio = missed / proposed;
                const list = mapValidators.get(ratio);
                if (list == null) {
                    mapValidators.set(ratio, [validator]);
                } else {
                    list.push(validator);
                }
            }
        }
        const sortedValidators = Array.from(mapValidators)
            .sort(([keyA], [keyB]) => {
                return keyA - keyB;
            })
            .map(([, addresses]) => addresses);
        this.depositAdditionalRewards(sortedValidators, totalReducedReward);
    }

    /**
     * Calculates the penaly fee following the commited votes per validator.
     * @param validators previous term's validator.
     * @param blockNumber current term's last block number to confiscate banned accounts' rewards.
     * @returns total rewards reduced by applying penalty.
     */
    private async applyPenalty(validators: string[], blockNumber: number): Promise<U64> {
        let totalReducedReward = new U64(0);

        for (const validator of validators) {
            const committedCnt = this.prevTermData.commitedVotesPerValidator.get(validator) || 0;
            const prevRewardOfValidator = this.prevTermData.intermediateReward.adjust(
                PlatformAddress.fromString(validator),
                new U64(0),
            );
            const parentTermPeriod =
                this.parentTermLastBlockNumber - this.parentTermFirstBlockNumber + 1;
            const rewardAfterPenalty = this.rewardAfterPenalty(
                parentTermPeriod - committedCnt,
                parentTermPeriod,
                prevRewardOfValidator,
            );
            const reduced = prevRewardOfValidator.minus(rewardAfterPenalty);
            this.prevTermData.intermediateReward.withdraw(
                PlatformAddress.fromString(validator),
                reduced,
            );
            totalReducedReward = totalReducedReward.plus(reduced);
        }
        return totalReducedReward;
    }

    /**
     * Record each validator's vote and propose count for every block.
     * @param block current block information.
     * @param validators validators of current block.
     */
    private async recordContribution(block: Block, validators: string[]) {
        const author = block.author;
        const validatorCount = validators.length;
        const PRECOMMIT_BITSET_IDX = 3;
        const precommitBitset = block.seal[PRECOMMIT_BITSET_IDX];
        const committedValidators = setBitIndices(
            decodeBitsetField(precommitBitset),
            validatorCount,
        );

        let targetData: TermData;
        if (this.parentTermLastBlockNumber + 1 === block.number) {
            targetData = this.prevTermData;
        } else {
            targetData = this.currentTermData;
        }
        for (const index of committedValidators) {
            const targetValidator = validators[index];
            const targetCount = targetData.commitedVotesPerValidator.get(targetValidator) || 0;
            targetData.commitedVotesPerValidator.set(targetValidator, targetCount + 1);
        }

        const [missed, proposed] = this.currentTermData.assembledVotesPerAuthor.get(
            author.value,
        ) || [0, 0];
        this.currentTermData.assembledVotesPerAuthor.set(author.value, [
            missed + validatorCount - committedValidators.length,
            proposed + 1,
        ]);
    }

    private rewardAfterPenalty(missedCnt: number, totalCnt: number, authorReward: U64): U64 {
        const x = authorReward.times(missedCnt);
        if (missedCnt * 3 <= totalCnt) {
            // 1 - 0.3 * x
            return authorReward
                .times(10 * totalCnt)
                .minus(x.times(3))
                .idiv(10 * totalCnt);
        } else if (missedCnt * 2 <= totalCnt) {
            // 2.5 - 4.8 * x
            return authorReward
                .times(25 * totalCnt)
                .minus(x.times(48))
                .idiv(10 * totalCnt);
        } else if (missedCnt * 3 <= 2 * totalCnt) {
            // 0.4 - 0.6 * x
            return authorReward
                .times(4 * totalCnt)
                .minus(x.times(6))
                .idiv(10 * totalCnt);
        } else {
            return new U64(0);
        }
    }

    private depositAdditionalRewards(sortedValidators: string[][], remainingReward: U64) {
        for (const validators of sortedValidators) {
            if (validators.length === 0) {
                continue;
            }
            let additionalReward = remainingReward.idiv(validators.length + 1);
            if (additionalReward.eq(0)) {
                break;
            }
            for (const validator of validators) {
                this.prevTermData.intermediateReward.deposit(
                    PlatformAddress.fromString(validator),
                    additionalReward,
                );
                remainingReward = remainingReward.minus(additionalReward);
            }
        }
    }
}
