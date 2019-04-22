import { U64 } from "codechain-primitives";
import { getConfig } from "./util";

const networkId = getConfig<string>("network_id");
const prefix = `[${networkId} network]`;
const suffix = `${(new Date()).toISOString()}`;

export interface CodeChainAlert {
  title: string;
  content: string;
}

export class CodeChainDeath implements CodeChainAlert {
  public title = `${prefix} CodeChain Death Confirmation ${suffix}`;
  public content = "CodeChain didn't renew the best block number for 1 hour.";
}

export class ViewTooHigh implements CodeChainAlert {
  public title: string;
  public content: string;

  constructor(blockNumber: number, view: U64) {
    this.title = `${prefix} CodeChain View Too High ${suffix}`;
    this.content = `View of the block(${blockNumber}) in CodeChain is ${view.toString(
      10
    )}! An inspection is needed.`;
  }
}

export class NodeIsSleeping implements CodeChainAlert {
  public title: string;
  public content: string;

  constructor(blockNumber: number, nodeIndices: number[]) {
    this.title = `${prefix} CodeChain Node is Sleeping ${suffix}`;
    this.content = `For the block(${blockNumber}), validating nodes ${nodeIndices} did not precommit.`;
  }
}

export class AllNodesAwake implements CodeChainAlert {
  public title: string;
  public content: string;

  constructor(blockNumber: number) {
    this.title = `${prefix} All CodeChain nodes are awake ${suffix}`;
    this.content = `Before the block(${blockNumber}) some nodes did not precommit, but now all nodes are recovered.`;
  }
}

export class GetBlockFailed implements CodeChainAlert {
  public title: string;
  public content: string;

  constructor(blockNumber: number) {
    this.title = `${prefix} CodeChain failed to get a block ${suffix}`;
    this.content = `RPC chain_getBlockByNumber failed with the best block number ${blockNumber}`;
  }
}
