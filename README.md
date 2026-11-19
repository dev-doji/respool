# Respool

Liquidity that moves to wherever it's needed. One reactive contract on Reactive Lasna watches Uniswap v4
pools on **Unichain Sepolia** and **Base Sepolia**, re-centres positions that fall out of range, and moves
liquidity to the chain where trading demand is. Every action is one timed loop: event → Reactive →
callback.

Built for the Reactive hackathon track **Every Second Counts**. Full design: [docs/SPEC.md](docs/SPEC.md).

> Testnet only. The tokens Respool moves between chains are its own test tokens, not real assets.

## Status

| Part | State |
|---|---|
| Spec and verified platform addresses | Written ([docs/SPEC.md](docs/SPEC.md)) |
| `RespoolPolicy` decision rules | Done: 9 tests in `test/RespoolPolicy.t.sol`, including fuzz tests |
| `RespoolToken` (test-only ERC-20) and `RespoolVault` | Done, tested locally: 18 tests in `test/RespoolVault.t.sol` against a real v4 PoolManager deployed in the test (recentre, depart, arrive, auth, duplicate and out-of-order callbacks, supply conserved across a move, leftover tokens parked in a one-sided limit position instead of idle). Deployed on Base Sepolia and Unichain Sepolia |
| `RespoolBrain` (reactive contract) | Done, tested locally: 18 unit tests in `test/RespoolBrain.t.sol` (subscriptions, recentre rule, move rule, arrive only for the in-flight move, auth) using a mock of the Reactive system contract. Deployed on Lasna |
| `RespoolBridgeWatcher` (reactive contract) | Done: 8 tests in `test/RespoolBridgeWatcher.t.sol` (subscriptions, owner-only setup, latency stats, duplicate / unknown / wrong-chain observations). **Live on Lasna** watching Across on Unichain Sepolia and Base Sepolia: it recorded one real 0.001 ETH transfer, deposit to fill 4 s by Reactive's clock (n = 1). Details in [docs/LATENCY.md](docs/LATENCY.md) |
| `RespoolEarnVault` + `RespoolRewardToken` | Done: 18 tests in `test/RespoolEarnVault.t.sol` (1:1 deposit and redeem, redeem still works with a broken reward token, proportional and late-joiner rewards, rolled funding, fee-on-transfer asset rejected, shares non-transferable, paid never exceeds funded). **Deployed**: Base Sepolia vault `0x687b691530d91C87061837AB2eb28156E51E0958` (reward token `0x22bD4B2D0fD6fe9b33c8822549872C547cc8568D`); Unichain Sepolia vault `0x7C5c0A6615902C0a23eC53Ed1E7DF0fbbEB66203` (reward token `0x687b691530d91C87061837AB2eb28156E51E0958`). A deposit of test USDC stays 1:1 redeemable. Depositors also earn **test rewards (tRSP)**: 30,000 tRSP on each chain, released evenly until about 2026-12-19 (about 1,000 a day), shared in proportion to deposits. **The rewards are a worthless test token paid out by the deployer, not trading fees**; the Uniswap vault's fees are not paid to depositors. Time with nobody deposited pays no one |
| End-to-end loop (**simulated**) | 3 tests in `test/RespoolLoop.t.sol`: real brain + two real vaults + a test relay standing in for Reactive Network. Shows recentre and a full cross-pool move. No real network, no timing |
| Deploy scripts | Written ([docs/DEPLOY.md](docs/DEPLOY.md)). Full sequence rehearsed on local forks with `bash script/dryrun.sh` |
| Live on testnets | **Lasna + Base Sepolia + Unichain Sepolia: deployed and working.** Recentre loops run on both chains; cross-chain moves run live in both directions (Unichain → Base and Base → Unichain). One duplicate callback delivery was seen live and skipped by the vault |
| Latency | **Four live batches; in every one, every swap completed its recentre loop** ([docs/LATENCY.md](docs/LATENCY.md)). Latest batch (brain v4, 34 swaps), full loop, block clock: recentre on Base median 1.6 s (p95 2.4 s), recentre on Unichain median 2.0 s (p95 3.0 s, whole-second clock), cross-chain move median 3.4 s (p95 4.0 s, only 5 moves, so indicative). Earlier batches (up to 30 swaps) gave similar figures. No Ethereum Sepolia baseline yet |
| Move direction | Batches 1 and 2 moved liquidity toward Base 24 times out of 24, whatever the trading pattern. Batch 3 (volume-based demand) then went one way again, toward Unichain. Batch 4 (demand = recent swap count): **balanced alternating trading moved nothing (0 of 10 swaps); bursts of 6 swaps moved liquidity toward the busy chain in both directions** (5 moves in 24 swaps). Tests lock this in |
| Bridge test (not in Respool yet) | One real 0.001 ETH transfer through Across, Unichain Sepolia to Base Sepolia, filled about 2 to 3 s after the deposit; quoted ETH and USDC routes both ways. One sample. Details and tx hashes in [docs/LATENCY.md](docs/LATENCY.md) |
| Latency observer | `observer/observe.mjs` (Node 18+, no dependencies): `run` drives swaps and records loops, `summary` prints median / p95 (`RESULTS_FILE` picks the batch, default `results/loops.jsonl`) |
| Website | `web/`: a Next.js 15 app (same versions as Beeline: next 15.5.29, react 19.1.1, TypeScript 5.9.2) in the usebeeline.xyz look. Replays any of the 39 recorded loops step by step, plots every loop with median and p95, and reads both vaults and the brain live from the chains in your browser. `npm run typecheck` and `npm run build` pass; checked in a browser with no console errors. **One simple page, `/app`, holds the whole flow**: a "Where to put your money" board (one bar per testnet: Base Sepolia, Unichain Sepolia, Arbitrum Sepolia and Ethereum Sepolia, read from each chain's Uniswap v4 PoolManager Swap events over the last half hour; the bar is the test fees $100 would have earned in a day in the busiest pool, from fee x volume / pool value; it is read-only, it is testnet bot-heavy trading rather than real earnings, a chain with fewer than 3 swaps is marked too quiet to rank, and only Base and Unichain can be deposited to here; the written suggestion comes from Google Gemini through the site's `/api/explain` Worker when `GEMINI_API_KEY` is set as a Cloudflare secret, and from a fixed rule otherwise); then a one-line "next step" that reads your balances and Reactive's swap-activity reading (for example, move USDC from the quiet chain to the busy one), and two tabs: "Deposit and earn" (your money on each chain, deposit, withdraw, a live test-reward counter and Claim) and "Move between chains" (the Across Move panel). There is no map or simulation on the page. It connects a browser wallet (RainbowKit). On Base Sepolia and Unichain Sepolia it uses the `RespoolEarnVault` above. Two real Unichain to Base USDC moves made through the app were delivered (observed on chain); a Base to Unichain move was still pending after 25 minutes. A deposit, withdrawal and claim on the new vaults through a browser wallet have not been tried yet. The page also shows an activity table of the actions taken in that browser, each checked against the chain by its transaction receipt (it does not scan chain history: the public RPCs cap `eth_getLogs` at 1,000 blocks on Unichain and 200 on Base). After a confirmed transaction it waits for the wallet's node to catch up, and shows the expected balances if the node stays behind. Light and dark themes (toggle in the nav, saved in the browser). **Hosted on Cloudflare** (static export): https://respool.foniolabs.xyz (one page: `/app`; the old `/app/map` link redirects there). Redeploy: `cd web && EXPORT=1 npm run build && npx wrangler deploy --config wrangler.static.jsonc`. |
| Known limits | After a full crossing a vault holds one token and cannot rebuild a two-sided position at the new price without an outside venue; leftover tokens go into a one-sided limit position (13 top-ups in batch 1, 2 in batch 2, 0 in batch 4). The move rule has only been run with the driver's evenly spaced swaps, not real trading. One move needs about 3.4 s end to end, so a burst shorter than that is over before liquidity arrives. See LATENCY.md |

## Requirements

- [Foundry](https://getfoundry.sh) (`forge`, `cast`)
- Git (dependencies are git submodules)

## Setup

```bash
git clone https://github.com/dev-doji/respool.git
cd respool
git submodule update --init
git -C lib/v4-core submodule update --init lib/solmate
forge build
forge test
```

Do not use `--recurse-submodules` or `--recursive`: Uniswap v4-core nests an OpenZeppelin repository that fails
to clone. Only `solmate` is needed from inside v4-core, and the second command fetches just that. Checked on a
fresh clone: `forge build` succeeds and `forge test` passes all 83 tests.
`forge test` currently runs 83 tests; all pass.

## Website

A Next.js app in `web/`. You need Node 18+.

```bash
cd web
npm install
npm run dev
```

Then open <http://localhost:3000>, or <http://localhost:3000/app> for the wallet page. `/app/preview` shows every state of the vault panel with fake data; it exists only in development and is a 404 in a production build. If port 3000 is busy (for example Beeline is running), use `npm run dev -- -p 3001`.

`npm run build` makes a production build, `npm run typecheck` checks the types, and `npm test` runs 29 tests (Across and receipt decoding against real transfers, the stale-balance logic, the move-recommendation policy, and the chain board's Swap-log decoding, fee maths and ranking, using hand-built logs, not a live chain). **Gemini key (optional).** The chain board's written suggestion uses Google Gemini through `web/worker/index.ts`, the site's only server code. Put the key in a Cloudflare secret, never in the page or the repo: `cd web && npx wrangler secret put GEMINI_API_KEY --config wrangler.static.jsonc`, then redeploy. For `npx wrangler dev --config wrangler.static.jsonc` put `GEMINI_API_KEY=...` in `web/.dev.vars` (git-ignored). `GEMINI_MODEL` can override the default model. Without a key the site shows a fixed-rule sentence instead. The Worker was tested for input validation, origin check and the no-key path; a successful Gemini answer has not been seen because no key has been set yet.

Every number on the page comes
from `web/lib/data.json`, which `npm run data` regenerates from the repo's own `deployments/` and `results/`
files. The Vaults section reads the chains directly over public RPC, so it needs a network connection; if a node
is unreachable the page says so instead of showing stale values.

## Layout

```
src/RespoolPolicy.sol        pure decision rules (range, EWMA demand, move rule)
src/RespoolLiquidity.sol     liquidity-for-amounts maths
src/RespoolToken.sol         test-only ERC-20 the vaults mint and burn
src/RespoolVault.sol         per-chain v4 position + Reactive callbacks (recentre / depart / arrive)
src/RespoolUSDCVault.sol     test-USDC custody pilot used by the /app page, on Base and Unichain Sepolia (1:1 shares, no yield)
src/RespoolBrain.sol         reactive contract for Lasna: watches both chains, requests callbacks
src/RespoolBridgeWatcher.sol reactive contract for Lasna: watches Across deposits and fills
test/RespoolPolicy.t.sol     unit + fuzz tests for the rules
test/RespoolVault.t.sol      vault tests on a local Uniswap v4 PoolManager
test/RespoolBrain.t.sol      brain unit tests with hand-built logs
test/RespoolBridgeWatcher.t.sol  bridge watcher tests with hand-built Across logs
test/RespoolLoop.t.sol       simulated end-to-end loop (brain + both vaults + test relay)
test/utils/MockSystem.sol    test double for the Reactive system contract
test/utils/V4Artifacts.sol   compiles PoolManager (solc 0.8.26) so tests can deploy it
script/RespoolConfig.sol     per-chain addresses (checked on chain) and brain settings
script/*.s.sol               DeployBrain, DeployChain, ConfigureBrain, Bootstrap, Swap, DeployBridgeWatcher
script/dryrun.sh             rehearse all scripts on local forks (needs anvil)
deployments/                 addresses written by the scripts, one JSON per chain
observer/observe.mjs         live latency observer and swap driver
results/                     raw loop records (loops.jsonl) and run logs
docs/SPEC.md                 design, verified addresses, latency method, milestones
docs/DEPLOY.md               testnet deployment steps, funding, faucets
docs/LATENCY.md              live latency measurements with tx hashes
web/                        the website (Next.js): app/, components/, lib/
web/scripts/build-data.mjs   builds web/lib/data.json from deployments/ and results/
```
