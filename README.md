# CodeChain Santa

This project is aimed to airdrop AssetTransferTransactions, including orders for CodeChain.

## How to run
- create a configuration file under the `config` folder.
- run the command 
  ```
    $ yarn install
    $ yarn start
  ```

## What Santa needs
- Santa needs a platform address.
  - This address is the payer so it should have enough CCC to execute transactions.
- Santa needs a CodeChain node to use the RPC.

## What Santa creates
- Santa creates 10 asset addresses.
  - They will be participants of `AssetTransferTransactions` including `Orders`.
- Santa mints 20 assets.
  - Each asset address will have two assets: One of them will be used to trade with other assets, and
    the other will be used to pay fees for orders.
- Santa creates and mints every time it is initialized.

## What Santa does
- Every 10 seconds, Santa first generates `Orders`.
  - These orders may or may not include fees.
  - Trading assets will be chosen randomly.
  - Trading ratios are determined randomly.
  - There is about a 45% chance to generate a single order and a 45% chance to generate two related orders.
  - There is about a 10% chance to generate highly(3 or more) entangled orders.
  - Generated Orders may either be entangled with each other, or only a single generated order.
- Using generated `Orders`, Santa generates `AssetTransferTransaction`.
  - The Generated transaction has consistent inputs and outputs with orders.
  - The trading quantities are randomly determined among the multiples of the given ratios in `Orders`.
  - There is about a 50% chance to generate a transaction which continuously fills the previous partially filled order.
- Using FlawGenerator, Santa contaminates `Order` and `AssetTransferTransaction`.
  - Here, the term 'contaminate' means Santa injects errors to make them incorrect.   
  - There is a 10% chance each for `Order` and `AssetTranferTransaction` to be contaminated.
  - Then those contaminated `Order` and `AssetTranferTransaction` are transmitted to the SDK.
  - Errors would be detected during the importation.
