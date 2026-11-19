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
| `RespoolBridgeWatcher` (reactive contract) | Done: 8 tests in `test/RespoolBridgeWatcher.t.sol` (subscriptions, owner-only setup, latency stats, duplicate / unknown / wrong-chain observations). **Live on Lasna** watching Across on Unichain Sepolia and Base Sepolia: it recorded one real 0.001 ETH transfer, deposit to fill 4 s by Reactive's clock (n = 1). Shown on the map page. Details in [docs/LATENCY.md](docs/LATENCY.md) |
| End-to-end loop (**simulated**) | 3 tests in `test/RespoolLoop.t.sol`: real brain + two real vaults + a test relay standing in for Reactive Network. Shows recentre and a full cross-pool move. No real network, no timing |
| Deploy scripts | Written ([docs/DEPLOY.md](docs/DEPLOY.md)). Full sequence rehearsed on local forks with `bash script/dryrun.sh` |
| Live on testnets | **Lasna + Base Sepolia + Unichain Sepolia: deployed and working.** Recentre loops run on both chains; cross-chain moves run live in both directions (Unichain → Base and Base → Unichain). One duplicate callback delivery was seen live and skipped by the vault |
| Latency | **Four live batches; in every one, every swap completed its recentre loop** ([docs/LATENCY.md](docs/LATENCY.md)). Latest batch (brain v4, 34 swaps), full loop, block clock: recentre on Base median 1.6 s (p95 2.4 s), recentre on Unichain median 2.0 s (p95 3.0 s, whole-second clock), cross-chain move median 3.4 s (p95 4.0 s, only 5 moves, so indicative). Earlier batches (up to 30 swaps) gave similar figures. No Ethereum Sepolia baseline yet |
| Move direction | Batches 1 and 2 moved liquidity toward Base 24 times out of 24, whatever the trading pattern. Batch 3 (volume-based demand) then went one way again, toward Unichain. Batch 4 (demand = recent swap count): **balanced alternating trading moved nothing (0 of 10 swaps); bursts of 6 swaps moved liquidity toward the busy chain in both directions** (5 moves in 24 swaps). Tests lock this in |
| Bridge test (not in Respool yet) | One real 0.001 ETH transfer through Across, Unichain Sepolia to Base Sepolia, filled about 2 to 3 s after the deposit; quoted ETH and USDC routes both ways. One sample. Details and tx hashes in [docs/LATENCY.md](docs/LATENCY.md) |
| Latency observer | `observer/observe.mjs` (Node 18+, no dependencies): `run` drives swaps and records loops, `summary` prints median / p95 (`RESULTS_FILE` picks the batch, default `results/loops.jsonl`) |
| Website | `web/`: a Next.js 15 app (same versions as Beeline: next 15.5.29, react 19.1.1, TypeScript 5.9.2) in the usebeeline.xyz look. Replays any of the 39 recorded loops step by step, plots every loop with median and p95, and reads both vaults and the brain live from the chains in your browser. `npm run typecheck` and `npm run build` pass; checked in a browser with no console errors. The `/app` page connects a wallet (RainbowKit) and has a test-USDC vault panel; its test-USDC vault (`RespoolUSDCVault`, a plain 1:1 custody pilot with no yield) is **deployed on Base Sepolia** (`0x58E05155d38F747292929Fd25D242d282A319c29`) and **Unichain Sepolia** (`0x69F358fA4D98EC89C243F634ffDd2135f7165FfB`), with a chain picker in the app, A real wallet approval has been confirmed on Unichain Sepolia (tx `0x71da882a…0d93`, 5 test USDC); a real deposit and withdrawal have not been tried yet. The page also shows an activity table of the actions taken in that browser, each checked against the chain by its transaction receipt (it does not scan chain history: the public RPCs cap `eth_getLogs` at 1,000 blocks on Unichain and 200 on Base). After a confirmed transaction it waits for the wallet's node to catch up, and shows the expected balances if the node stays behind. The map page draws a network map: both pools, Reactive Network and the Across bridge, with live swap activity and pool sizes, plus a clearly labelled **Simulate** button that replays a move with compressed timing (not real transactions). Light and dark themes (toggle in the nav, saved in the browser). **Hosted on Cloudflare** (static export): https://respool.foniolabs.xyz (app: `/app`, map: `/app/map`). Redeploy: `cd web && EXPORT=1 npm run build && npx wrangler deploy --config wrangler.static.jsonc`. |
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
fresh clone: `forge build` succeeds and `forge test` passes all 65 tests.
`forge test` currently runs 65 tests; all pass.

## Website

A Next.js app in `web/`. You need Node 18+.

```bash
cd web
npm install
npm run dev
```

Then open <http://localhost:3000>, or <http://localhost:3000/app> for the wallet page. `/app/preview` shows every state of the vault panel with fake data; it exists only in development and is a 404 in a production build. If port 3000 is busy (for example Beeline is running), use `npm run dev -- -p 3001`.

`npm run build` makes a production build, `npm run typecheck` checks the types, and `npm test` runs 9 tests (receipt decoding against a real Unichain approval, and the stale-balance logic). Every number on the page comes
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
