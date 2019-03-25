# Tick-Tock
This project is an example of how to use a permissioned asset in CodeChain.

## How to run
* Create **dev/production.json**
* and
```
NODE_ENV=production yarn start
```

# What Tick-Tock needs
* Tick-Tock needs a platform address.
    * This address is a payer. So it should have enough CCC to execute transactions.
* Tick-Tock needs a CodeChain node to use the RPC.

# What Tick-Tock creates
* Tick-Tock creates 60 asset addresses.
    * They will be used to represent the time. In other words, the `user[4]` would be the user who represents 4 hours, 4 minutes, 4 seconds.
* Tick-Tock creates 3 platform addresses.
    * These addresses are used as an approver of hands.
* Tick-Tock creates a shard.
    * Assets are minted on this shard.
* Tick-Tock mints 3 assets.
    * They are clock hands. Each asset means an hour hand, minute hand and second hand.
    * The platform addresses created in the previous step will be used as an approver of the hands.
* The addresses and the shard id are saved on files(.users, .shard, .approvers), but the minted assets are not backed up.
* Tick-Tock mints new assets every time it starts.

# What Tick-Tock does
* Every second, Tick-Tock moves the second hand to the current second user.
* If the minute has changed, Tick-Tock also moves the minute hand.
* The same way works for the hour hand.
* Tick-Tock creates a transaction with insufficient approvals randomly. This transaction will not move the clock hands.
