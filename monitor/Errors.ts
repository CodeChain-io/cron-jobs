export interface CodeChainAlert {
  title: string;
  content: string;
}

export class CodeChainDeath implements CodeChainAlert {
  public title: string;
  public content: string;

  constructor() {
    this.title = "[CodeChain Death Confirmation]";
    this.content = "CodeChain didn't renew the best block number for 1 hour.";
  }
}

export class ViewTooHigh implements CodeChainAlert {
  public title: string;
  public content: string;

  constructor(view: number) {
    this.title = "[CodeChain View Too High]";
    this.content = `View of the last block in CodeChain is ${view}! Inspection is needed.`;
  }
}
