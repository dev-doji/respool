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
| `RespoolPolicy` decision rules | Done: 8 tests in `test/RespoolPolicy.t.sol`, including a fuzz test |
| `RespoolToken` (test-only ERC-20) and `RespoolVault` | Done, tested locally: 18 tests in `test/RespoolVault.t.sol` against a real v4 PoolManager deployed in the test (recentre, depart, arrive, auth, duplicate and out-of-order callbacks, supply conserved across a move, leftover tokens parked in a one-sided limit position instead of idle). Deployed on Base Sepolia and Unichain Sepolia |
| `RespoolBrain` (reactive contract) | Done, tested locally: 15 unit tests in `test/RespoolBrain.t.sol` (subscriptions, recentre rule, move rule, arrive only for the in-flight move, auth) using a mock of the Reactive system contract. Deployed on Lasna |
| End-to-end loop (**simulated**) | 3 tests in `test/RespoolLoop.t.sol`: real brain + two real vaults + a test relay standing in for Reactive Network. Shows recentre and a full cross-pool move. No real network, no timing |
| Deploy scripts | Written ([docs/DEPLOY.md](docs/DEPLOY.md)). Full sequence rehearsed on local forks with `bash script/dryrun.sh` |
| Live on testnets | **Lasna + Base Sepolia + Unichain Sepolia: deployed and working.** Recentre loops run on both chains; cross-chain moves (Unichain → Base) run live. One duplicate callback delivery was seen live and skipped by the vault |
| Latency | **Two live batches, 61 recentre loops and 24 cross-chain moves, every swap completed its loop** ([docs/LATENCY.md](docs/LATENCY.md)). Latest batch, full loop, block clock: recentre on Base median 1.4 s (p95 2.6 s), recentre on Unichain median 2.0 s (p95 3.0 s, whole-second clock), move Unichain → Base median 3.6 s (p95 4.6 s). No Ethereum Sepolia baseline yet |
| Latency observer | `observer/observe.mjs` (Node 18+, no dependencies): `run` drives swaps and records loops, `summary` prints median / p95 (`RESULTS_FILE` picks the batch, default `results/loops.jsonl`) |
| Known limits | After a full crossing a vault holds one token and cannot rebuild a two-sided position at the new price without an outside venue; leftover tokens now go into a one-sided limit position (top-ups fell from 13 to 2 between batches; the 2 were caused by moves emptying Unichain). Moves have only gone toward Base so far: the demand rule's direction is untuned. See LATENCY.md |

## Requirements

- [Foundry](https://getfoundry.sh) (`forge`, `cast`)
- Git (dependencies are git submodules)

## Setup

```bash
git clone --recurse-submodules <repo-url> respool
cd respool
forge build
forge test
```

If you cloned without `--recurse-submodules`, run `git submodule update --init --recursive` first.
`forge test` currently runs 44 tests; all pass.

## Layout

```
src/RespoolPolicy.sol        pure decision rules (range, EWMA demand, move rule)
src/RespoolLiquidity.sol     liquidity-for-amounts maths
src/RespoolToken.sol         test-only ERC-20 the vaults mint and burn
src/RespoolVault.sol         per-chain v4 position + Reactive callbacks (recentre / depart / arrive)
src/RespoolBrain.sol         reactive contract for Lasna: watches both chains, requests callbacks
test/RespoolPolicy.t.sol     unit + fuzz tests for the rules
test/RespoolVault.t.sol      vault tests on a local Uniswap v4 PoolManager
test/RespoolBrain.t.sol      brain unit tests with hand-built logs
test/RespoolLoop.t.sol       simulated end-to-end loop (brain + both vaults + test relay)
test/utils/MockSystem.sol    test double for the Reactive system contract
test/utils/V4Artifacts.sol   compiles PoolManager (solc 0.8.26) so tests can deploy it
script/RespoolConfig.sol     per-chain addresses (checked on chain) and brain settings
script/*.s.sol               DeployBrain, DeployChain, ConfigureBrain, Bootstrap, Swap
script/dryrun.sh             rehearse all scripts on local forks (needs anvil)
deployments/                 addresses written by the scripts, one JSON per chain
observer/observe.mjs         live latency observer and swap driver
results/                     raw loop records (loops.jsonl) and run logs
docs/SPEC.md                 design, verified addresses, latency method, milestones
docs/DEPLOY.md               testnet deployment steps, funding, faucets
docs/LATENCY.md              live latency measurements with tx hashes
```
