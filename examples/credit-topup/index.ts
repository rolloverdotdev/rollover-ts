// Credit Top-Up
//
// Monitor a wallet's credit balance on an interval and automatically grant
// more credits when the balance drops below a configured threshold.
//
//   ROLLOVER_API_KEY=ro_live_... npx tsx examples/credit-topup/index.ts

import { Rollover } from "@rolloverdotdev/server";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });
const wallet = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const LOW_BALANCE_THRESHOLD = 100;
const TOP_UP_AMOUNT = 500;
const CHECK_INTERVAL_MS = 30_000;

console.log(`Monitoring ${wallet.slice(0, 12)}... (threshold: ${LOW_BALANCE_THRESHOLD}, top-up: ${TOP_UP_AMOUNT})`);

async function checkAndTopUp() {
  const balance = await ro.getCredits({ wallet });
  const time = new Date().toLocaleTimeString();

  process.stdout.write(`[${time}] balance: ${balance.balance}`);

  if (balance.balance < LOW_BALANCE_THRESHOLD) {
    console.log(` (low! granting ${TOP_UP_AMOUNT} credits)`);

    const grant = await ro.grantCredits({
      wallet,
      amount: TOP_UP_AMOUNT,
      description: "Auto top-up: balance below threshold",
    });
    console.log(`  new balance: ${grant.balance}`);
  } else {
    console.log(" (ok)");
  }
}

await checkAndTopUp();
setInterval(checkAndTopUp, CHECK_INTERVAL_MS);
