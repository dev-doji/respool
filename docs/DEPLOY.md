# Deploying Respool to testnets

Three networks: **Reactive Lasna** (the brain), **Unichain Sepolia** and **Base Sepolia** (a pool and a
vault on each). All addresses the scripts use are in [script/RespoolConfig.sol](../script/RespoolConfig.sol)
and were checked on chain on 2026-11-13.

## 0. Wallet and funds

Use a **new wallet used only for these testnets**. Put its key in `.env` (copied from `.env.example`);
`.env` is git-ignored and Foundry loads it automatically. Never paste the key anywhere else.

| Network | Needed for | Rough amount (estimate) |
|---|---|---|
| Base Sepolia ETH | deploying + vault callback funding, and buying lREACT | 0.15 ETH |
| Unichain Sepolia ETH | deploying + vault callback funding | 0.05 ETH |
| Lasna lREACT | deploying the brain + its reactive transactions | 10 lREACT |

Get Base Sepolia and Unichain Sepolia ETH from public faucets. For **lREACT**, send Base Sepolia ETH to
Reactive's faucet contract (1 ETH → 100 lREACT, at most 5 ETH per transaction; anything above is lost):

```bash
cast send 0x2afaFD298b23b62760711756088F75B7409f5967 "request(address)" YOUR_ADDRESS --value 0.1ether --rpc-url base_sepolia --private-key $PRIVATE_KEY
```

There is also a faucet on Ethereum Sepolia: `0x9b9BB25f1A81078C544C829c5EB7822d747Cf434`.
Source: dev.reactive.network/reactive-mainnet.

## 1. Rehearse locally (optional, free)

```bash
bash script/dryrun.sh
```

Runs every step below on local forks with anvil's test account. It checks the scripts, not Reactive's
event delivery (a fork doesn't run the Reactive network).

## 2. Deploy

Run from the repo root, in this order. Each step writes `deployments/<chainId>.json`, which later steps read.

```bash
forge script script/DeployBrain.s.sol --rpc-url lasna --broadcast
```

Copy the printed brain address into `.env` as `BRAIN=0x...`, then:

```bash
forge script script/DeployChain.s.sol --rpc-url unichain_sepolia --broadcast
```

```bash
forge script script/DeployChain.s.sol --rpc-url base_sepolia --broadcast
```

```bash
forge script script/ConfigureBrain.s.sol --rpc-url lasna --broadcast
```

```bash
forge script script/Bootstrap.s.sol --rpc-url unichain_sepolia --broadcast
```

```bash
forge script script/Bootstrap.s.sol --rpc-url base_sepolia --broadcast
```

Optional overrides (env): `BRAIN_FUND_WEI` (default 5 lREACT), `VAULT_FUND_WEI` (default 0.01 ETH),
`SEED_WEI` (default 100 test tokens per side).

## 3. Trigger the brain

```bash
forge script script/Swap.s.sol --rpc-url unichain_sepolia --broadcast
```

`SWAP_WEI` (default 1 token), `ZERO_FOR_ONE` (default true), `LIMIT_TICKS` (default 600). Repeated swaps
on one chain build its demand score until liquidity moves there; a big swap pushes the price out of range
and triggers a recentre.

## 4. Check it worked

- Brain on Lasna: https://lasna.reactscan.net/ (look for `RecentreRequested`, `MoveRequested`).
- Vaults: `Recentred`, `Departed`, `Arrived` events on each chain's explorer.

## What is verified so far

| Item | State |
|---|---|
| Addresses (PoolManager, PoolSwapTest, callback proxies, lREACT faucet) | Code present on chain; routers point at the right PoolManager |
| Lasna EVM | Accepts Cancun opcodes (PUSH0, MCOPY, TLOAD), checked with read-only calls |
| Scripts | Full sequence succeeds on local forks (`script/dryrun.sh`) |
| `subscribe()` after deployment | Did not revert against a fork of Lasna's system contract; live delivery not yet seen |
| Live callbacks on Unichain Sepolia / Base Sepolia | Not yet run |
