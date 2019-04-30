import { U64 } from "codechain-primitives";
import { getConfig } from "./util";

const networkId = getConfig<string>("network_id");

export interface CodeChainAlert {
  readonly title: string;
  readonly content: string;
  readonly level: "error" | "warn" | "info";
}

export class CodeChainDeath implements CodeChainAlert {
  public readonly title: string;
  public readonly content: string;
  public readonly level = "error";

  constructor() {
    const suffix = `${new Date().toISOString()}`;
    const prefix = `[${this.level}][${networkId}][monitor]`;
    this.title = `${prefix} CodeChain Death Confirmation ${suffix}`;
    this.content = "CodeChain didn't renew the best block number for 1 hour.";
  }
}

export class ViewTooHigh implements CodeChainAlert {
  public readonly title: string;
  public readonly content: string;
  public readonly level = "warn";

  constructor(blockNumber: number, view: U64) {
    const suffix = `${new Date().toISOString()}`;
    const prefix = `[${this.level}][${networkId}][monitor]`;
    this.title = `${prefix} CodeChain View Too High ${suffix}`;
    this.content = `View of the block(${blockNumber}) in CodeChain is ${view.toString(
      10
    )}! An inspection is needed.`;
  }
}

export class NodeIsSleeping implements CodeChainAlert {
  public readonly title: string;
  public readonly content: string;
  public readonly level = "warn";

  constructor(blockNumber: number, nodeIndices: number[], streak?: number) {
    const prefix = `[${this.level}][${networkId}][monitor]`;
    const suffix = `${new Date().toISOString()}`;
    this.title = `${prefix} CodeChain Node is Sleeping ${suffix}`;
    if (streak !== undefined) {
      this.content = `Consecutive ${streak} blocks from the block(${blockNumber -
        streak}), validating nodes ${nodeIndices} did not precommit.`;
    } else {
      this.content = `For the block(${blockNumber}), validating nodes ${nodeIndices} did not precommit.`;
    }
  }
}

export class NodeRecovered implements CodeChainAlert {
  public readonly title: string;
  public readonly content: string;
  public readonly level = "info";

  constructor(blockNumber: number, nodeIndex: number, sleepStreak: number) {
    const prefix = `[${this.level}][${networkId}][monitor]`;
    const suffix = `${new Date().toISOString()}`;
    this.title = `${prefix} CodeChain Node has recovered from the problem ${suffix}`;
    this.content = `The node ${nodeIndex} did not precommit from the block ${blockNumber -
      sleepStreak} consecutively. Now the node ${nodeIndex} has been recovered from the problem.`;
  }
}

export class AllNodesAwake implements CodeChainAlert {
  public readonly title: string;
  public readonly content: string;
  public readonly level = "info";

  constructor(blockNumber: number) {
    const prefix = `[${this.level}][${networkId}][monitor]`;
    const suffix = `${new Date().toISOString()}`;
    this.title = `${prefix} All CodeChain nodes are awake ${suffix}`;
    this.content = `Before the block(${blockNumber}) some nodes did not precommit, but now all nodes are recovered.`;
  }
}

export class GetBlockFailed implements CodeChainAlert {
  public readonly title: string;
  public readonly content: string;
  public readonly level = "error";

  constructor(blockNumber: number) {
    const prefix = `[${this.level}][${networkId}][monitor]`;
    const suffix = `${new Date().toISOString()}`;
    this.title = `${prefix} CodeChain failed to get a block ${suffix}`;
    this.content = `RPC chain_getBlockByNumber failed with the best block number ${blockNumber}`;
  }
}
