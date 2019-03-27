# CodeChain Santa

This project aimed to airdrop AssetTransferTransactions including orders for CodeChain.

## How to run
- create configuration file under `config` folder.
- run the command 
  ```
    $ yarn install
    $ yarn start
  ```

## What Santa needs
- Santa needs a platform address.
  - This address is a payer. So it should have enough CCC to execute transactions.
- Santa needs a CodeChain node to use the RPC.

## What Santa creates
- Santa creates 10 asset addresses.
  - They will be participants of `AssetTransferTransactions` including `Orders`.
- Santa mints 20 assets.
  - Each asset address will have two assets. one of them will be used to trade with other assets. 
    the other will be used to pay fees for orders.
- Santa creates and mints every time it starts.

## What Santa does
- Every 10 seconds, Santa firstly generates `Orders`.
  - These orders may include fees or not.
  - Trading assets will be chosen randomly.
  - Trading ratios are determined randomly.
  - There is about 45% chance to generate single order and 45% chance to two related orders.
  - There is about 10% chance to generated highly(3 or more) entangled orders.
  - Generated Orders may be entangled with each other, or there's only a single generated order.
- Using generated `Orders`, Santa generates `AssetTransferTransaction`.
  - The Generated transaction has consistent inputs and outputs with orders.
  - The trading quantities are randomly determined among the multiples of the given ratios in `Orders`.
  - There is about 50% chance to generate a transaction which continuously fills the previous partially filled order.
- Using FlawGenerator, Santa contaminates `Order` and `AssetTransferTransaction`.
  - Here contaminates means Santa injects errors to make them incorrect.   
  - There is 10% chance each for `Order` and `AssetTranferTransaction` to be contaminated.
  - Then those contaminated `Order` and `AssetTranferTransaction` are transmitted to SDK.
  - Errors would be detected during the importation.