// Tests for the Across module against the REAL transfer made on 2026-11-18:
// 0.001 ETH Unichain Sepolia -> Base Sepolia, deposit ID 6100 (fixtures captured from the chains).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodeFunctionData, parseAbi } from "viem";
import { depositCall, depositIdFromReceipt, approveCall, FILLED_RELAY_TOPIC, FUNDS_DEPOSITED_TOPIC, WETH, type Quote } from "../lib/across.ts";

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const deposit = JSON.parse(fx("across-deposit-receipt.json")).result as { logs: { address: string; topics: string[] }[] };
const fill = JSON.parse(fx("across-fill-receipt.json")).result as { logs: { address: string; topics: string[] }[] };
const realInput = fx("across-deposit-input.txt").trim();
const abi = parseAbi(["function depositV3(address depositor, address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityParameter, bytes message) payable"]);

const SP_UNI = "0x6999526e507Cc3b03b180BbE05E1Ff938259A874";
const SP_BASE = "0x82B564983aE7274c86695917BBf8C99ECb6F0F8F";
const DEPLOYER = "0x0326DBb448a879704b6a40D74D108485e1f25332";

test("the deposit ID is read from the real deposit receipt", () => {
  assert.equal(depositIdFromReceipt(deposit, SP_UNI), 6100n);
  assert.equal(depositIdFromReceipt(deposit, SP_BASE), undefined); // wrong pool: nothing
});

test("the event signatures match what the chains emitted", () => {
  const d = deposit.logs.find((l) => l.address.toLowerCase() === SP_UNI.toLowerCase())!;
  const f = fill.logs.find((l) => l.address.toLowerCase() === SP_BASE.toLowerCase())!;
  assert.equal(d.topics[0], FUNDS_DEPOSITED_TOPIC);
  assert.equal(f.topics[0], FILLED_RELAY_TOPIC);
  assert.equal(BigInt(f.topics[1]), 1301n); // origin chain
  assert.equal(BigInt(f.topics[2]), 6100n); // same deposit ID as the deposit
});

test("encoding the same arguments as the real transaction gives byte-identical call data", () => {
  const real = decodeFunctionData({ abi, data: realInput as `0x${string}` });
  const [depositor, recipient, inputToken, outputToken, inputAmount, outputAmount, destinationChainId, exclusiveRelayer, quoteTimestamp, fillDeadline, exclusivityParameter] = real.args as readonly [string, string, string, string, bigint, bigint, bigint, string, number, number, number, string];
  const quote: Quote = {
    timestamp: quoteTimestamp, fillDeadline, outputAmount: outputAmount, exclusiveRelayer, exclusivityDeadline: exclusivityParameter,
    totalRelayFee: inputAmount - outputAmount, estimatedFillTimeSec: 10, spokePool: SP_UNI, destinationSpokePool: SP_BASE,
    minDeposit: 0n, maxDeposit: 0n, isAmountTooLow: false,
  };
  const call = depositCall({ depositor, recipient, inputToken, outputToken, inputAmount, destinationChainId: Number(destinationChainId), quote, native: true });
  assert.equal(call.data.toLowerCase(), realInput.toLowerCase());
  assert.equal(call.to, SP_UNI);
  assert.equal(call.value, 1_000_000_000_000_000n); // native ETH: the amount travels as msg.value
  assert.equal(inputToken.toLowerCase(), WETH);
  assert.equal(depositor.toLowerCase(), DEPLOYER.toLowerCase());
});

test("a token deposit (USDC) sends no ETH value; approve targets the token", () => {
  const quote: Quote = { timestamp: 1, fillDeadline: 2, outputAmount: 990_000n, exclusiveRelayer: "0x0000000000000000000000000000000000000000", exclusivityDeadline: 0, totalRelayFee: 10_000n, estimatedFillTimeSec: 10, spokePool: SP_UNI, destinationSpokePool: SP_BASE, minDeposit: 0n, maxDeposit: 0n, isAmountTooLow: false };
  const usdcU = "0x31d0220469e10c4E71834a79b1f276d740d3768F", usdcB = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const call = depositCall({ depositor: DEPLOYER, recipient: DEPLOYER, inputToken: usdcU, outputToken: usdcB, inputAmount: 1_000_000n, destinationChainId: 84532, quote, native: false });
  assert.equal(call.value, 0n);
  const approve = approveCall(usdcU, SP_UNI, 1_000_000n);
  assert.equal(approve.to, usdcU);
  assert.equal(approve.data.slice(0, 10), "0x095ea7b3"); // approve(address,uint256)
});

test("a public node that answers null for a fresh block is retried, not a crash", async () => {
  const { blockTimestamp } = await import("../lib/across.ts");
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    const result = calls < 3 ? null : { timestamp: "0x6553f100" };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
  }) as typeof fetch;
  try {
    assert.equal(await blockTimestamp("http://rpc.test", "0x10", 5, 1), 0x6553f100);
    assert.equal(calls, 3);
    calls = -100; // never returns a block: fails with a clear message after the attempts
    globalThis.fetch = (async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }))) as typeof fetch;
    await assert.rejects(() => blockTimestamp("http://rpc.test", "0x10", 2, 1), /has not returned this block yet/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
