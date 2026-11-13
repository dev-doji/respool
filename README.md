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
| `RespoolToken` (test-only ERC-20) and `RespoolVault` | Done, tested locally: 13 tests in `test/RespoolVault.t.sol` against a real v4 PoolManager deployed in the test (recentre, depart, arrive, auth, duplicate and out-of-order callbacks, supply conserved across a move). Not deployed yet |
| `RespoolBrain` (reactive contract) | Done, tested locally: 15 unit tests in `test/RespoolBrain.t.sol` (subscriptions, recentre rule, move rule, arrive only for the in-flight move, auth) using a mock of the Reactive system contract. Not deployed yet |
| End-to-end loop (**simulated**) | 3 tests in `test/RespoolLoop.t.sol`: real brain + two real vaults + a test relay standing in for Reactive Network. Shows recentre and a full cross-pool move. No real network, no timing |
| Deployment to Lasna / Unichain Sepolia / Base Sepolia | Not started |
| Latency measurements | Not started |

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
`forge test` currently runs 39 tests; all pass.

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
docs/SPEC.md                 design, verified addresses, latency method, milestones
```
