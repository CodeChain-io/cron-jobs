# codechain-time-lock-scenario-test

codechain-time-lock-scenario-test is a tool for testing the timelock feature of CodeChain.

# Getting Started

## Clone the source code

```
[https://github.com/majecty/codechain-timelock-tester.git](https://github.com/majecty/codechain-timelock-tester.git)
```

## Install dependencies

```
cd codechain-timelock-tester && yarn install
```

## Prepare keystore.db file

Create keystore.db file and a platform account using `codechain-keystore-cli`.

## Modify the config file

Open `config/local.json` file and fill `faucetAddress`, `networkId`, and `codeChainRPCURL`.
See `config/default.json` as an example.

- networkId: the network id of the chain.
- codeChainRPCURL: the RPC URL of the CodeChain.
- faucetAddress: Platform address of the CCC holder. The address should be imported in the keystore.db file.

## Run

```
yarn start
```
