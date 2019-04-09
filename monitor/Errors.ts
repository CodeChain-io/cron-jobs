export interface CodeChainAlert {
  title: string;
  content: string;
}

export const codechainDeath: CodeChainAlert = {
  title: "[CodeChain Death Confirmation]",
  content: "CodeChain didn't renew the best block number for 1 hour."
};