// One tiny real Across transfer (testnet, 0.001 ETH) from the deployer wallet, so the Reactive bridge watcher has
// something real to observe. Usage (from web/): node scripts/bridge-test.mts unichain|base
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { depositCall, depositIdFromReceipt, fetchQuote, SPOKE_POOLS, WETH, findFill } from "../lib/across.ts";

const env = Object.fromEntries(readFileSync(new URL("../../.env", import.meta.url), "utf8").split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()]));
const dir = process.argv[2] === "base" ? "base" : "unichain";
const [from, to] = dir === "base" ? [84532, 1301] : [1301, 84532];
const rpcOf = (id: number) => (id === 1301 ? env.UNICHAIN_SEPOLIA_RPC : env.BASE_SEPOLIA_RPC);
const account = privateKeyToAccount(env.PRIVATE_KEY as Hex);
const amount = parseEther("0.001");

const quote = await fetchQuote({ inputToken: WETH, outputToken: WETH, originChainId: from, destinationChainId: to, amount });
const call = depositCall({ depositor: account.address, recipient: account.address, inputToken: WETH, outputToken: WETH, inputAmount: amount, destinationChainId: to, quote, native: true });
const chain = { id: from, name: String(from), nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcOf(from)] } } };
const wallet = createWalletClient({ account, chain, transport: http(rpcOf(from)) });
const pub = createPublicClient({ chain, transport: http(rpcOf(from)) });
const hash = await wallet.sendTransaction({ to: call.to as Hex, data: call.data, value: call.value });
console.log("deposit tx", hash);
const receipt = await pub.waitForTransactionReceipt({ hash });
const id = depositIdFromReceipt(receipt as never, SPOKE_POOLS[from]);
console.log("depositId", String(id), "block", String(receipt.blockNumber));
for (let i = 0; i < 40; i++) {
  const fill = await findFill(rpcOf(to), SPOKE_POOLS[to], from, id!, to === 1301 ? 900 : 190);
  if (fill) { console.log("fill", JSON.stringify(fill)); process.exit(0); }
  await new Promise((r) => setTimeout(r, 3000));
}
console.log("no fill seen in 2 minutes");
