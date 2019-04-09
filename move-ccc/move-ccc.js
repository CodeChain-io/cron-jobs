const { SDK } = require("codechain-sdk");
const assert = require("assert");

async function main() {
  const toAddress = process.argv[2];
  console.log(toAddress);

  try {
    SDK.Core.classes.PlatformAddress.fromString(toAddress);
  } catch (err) {
    console.error(`Invalid to address "${toAddress}"`);
    throw err;
  }

  let sdk = new SDK({
    server: "http://localhost:8080"
  });

  const networkId = await sdk.rpc.chain.getNetworkId();
  console.log(`Network Id ${networkId}`);

  sdk = new SDK({
    server: "http://localhost:8080",
    networkId
  });

  const accounts = await sdk.rpc.account.getList();
  console.log("Accounts: %j", accounts);
  assert.strictEqual(accounts.length, 1);

  const balance = await sdk.rpc.chain.getBalance(accounts[0]);
  console.log(`${accounts[0]}: ${balance}`);

  if (balance.lt(1000)) {
    return;
  }

  const payTransaction = sdk.core.createPayTransaction({
    recipient: toAddress,
    quantity: balance.minus(100)
  });

  const sendResult = await sdk.rpc.account.sendTransaction({
    tx: payTransaction,
    account: accounts[0],
    fee: 100
  });

  console.log(`Sent ${JSON.stringify(sendResult)}`);

  for (let i = 0; i < 100; i++) {
    const contains = await sdk.rpc.chain.containsTransaction(sendResult.hash);
    if (contains) {
      console.log(`Success ${sendResult.hash}`);
      return;
    }

    await new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, 1000);
    });
  }

  console.error(`Transaction is not mined ${sendResult.hash}`);
}

main().catch(console.error);
