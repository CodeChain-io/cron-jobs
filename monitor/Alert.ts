export interface CodeChainAlert {
  title: string;
  content: string;
}

export class CodeChainDeath implements CodeChainAlert {
  public title = "[CodeChain Death Confirmation]";
  public content = "CodeChain didn't renew the best block number for 1 hour.";
}

export class ViewTooHigh implements CodeChainAlert {
  public title: string;
  public content: string;

  constructor(view: number) {
    this.title = "[CodeChain View Too High]";
    this.content = `View of the last block in CodeChain is ${view}! Inspection is needed.`;
  }
}

export class NodeIsSleeping implements CodeChainAlert {
  public title: string;
  public content: string;

  constructor(nodeIndices: number[]) {
    this.title = "[CodeChain Node is Sleeping]";
    this.content = `Validating nodes #${nodeIndices} did not precommit.`;
  }
}

export class AllNodesAwake implements CodeChainAlert {
  public title = "[All CodeChain nodes are awake]";
  public content =
    "Previously some nodes did not precommit, but now all nodes are recovered.";
}

export class GetBlockFailed implements CodeChainAlert {
  public title: string;
  public content: string;

  constructor(blockNumber: number) {
    this.title = "[CodeChain get block failed]";
    this.content = `RPC chain_getBlockByNumber failed with the best block number ${blockNumber}`;
  }
}
