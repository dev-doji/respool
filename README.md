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
| `RespoolPolicy` decision rules | Done: 8 tests pass (`forge test`), including a fuzz test |
| `RespoolToken`, `RespoolVault`, `RespoolBrain` | Not started |
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

## Layout

```
src/RespoolPolicy.sol        pure decision rules (range, EWMA demand, move rule)
test/RespoolPolicy.t.sol     unit + fuzz tests for the rules
docs/SPEC.md                 design, verified addresses, latency method, milestones
```
