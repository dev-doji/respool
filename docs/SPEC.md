# Respool — Spec

Liquidity that moves to wherever it's needed, across Unichain Sepolia and Base Sepolia, driven by one
reactive contract on Reactive Lasna.

Hackathon track: **Every Second Counts** (low-latency DeFi on Unichain Sepolia / Base Sepolia).
Deadline: 2026-12-05 21:00.

## 1. The problem

A liquidity provider who splits capital between two chains has two failure modes:

1. **Out of range.** A concentrated position stops earning the moment price leaves its range. Each block
   it sits there is lost fees.
2. **Wrong chain.** Trading demand shifts between chains. Capital parked on the quiet chain earns
   nothing while the busy chain has thin depth and high price impact.

Neither chain can see the other. A keeper bot can, but it is a server someone has to run and trust.

## 2. The idea

One reactive contract on Lasna (`RespoolBrain`) watches the Uniswap v4 `Swap` events of a Respool pool on
**both** chains. It keeps the latest tick and a demand score per chain in its own storage, and when a rule
fires it requests a callback to a `RespoolVault` on the right chain:

| Trigger (seen by the brain) | Callback | Where |
|---|---|---|
| Swap moves the tick outside the vault's range | `recentre(tick)` | same chain |
| Demand on chain H outweighs chain C by `k`×, nothing in flight | `depart(moveId, share)` | chain C |
| `Departed(moveId, amounts)` event on chain C | `arrive(moveId, amounts)` | chain H |

Every action is one loop **event → Reactive → callback**, and every loop is timed (section 5).

## 3. Verified platform facts (2026-11-12)

Sources: dev.reactive.network (origins-and-destinations, reactive-contracts, callback-contracts),
github.com/Reactive-Network/reactive-lib-omni, developers.uniswap.org v4 deployments.

| Item | Value |
|---|---|
| Lasna chain ID / RPC | `5318007` / `https://lasna-rpc.rnk.dev/` |
| Lasna system contract | `0x8888888888888888888888888888888888888888` |
| Unichain Sepolia (1301) callback proxy | `0x775c9B990ADe401060B78D0e98684eEf8d2466C1` |
| Base Sepolia (84532) callback proxy | `0x476F44b11F5C942c58f4c8E3d0300E5710743585` |
| Unichain Sepolia v4 PoolManager | `0x00b036b58a818b1bc34d502d3fe730db729e62ac` |
| Unichain Sepolia PoolSwapTest | `0x9140a78c1a137c7ff1c151ec8231272af78a99a4` |
| Base Sepolia v4 PoolManager | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` |
| Base Sepolia PoolSwapTest | `0x8b5bcc363dde2614281ad875bad385e0a785d3b9` |

Library: `reactive-lib-omni` (Solidity `^0.8.29`).

- Reactive contract extends `AbstractReactive`; `react(LogRecord)` is guarded by `onlySystem`.
- Subscriptions: `SYSTEM.subscribe(chainId, contract, topic0..3)`; `REACTIVE_IGNORE` is the wildcard.
- Callbacks: `SYSTEM.requestCallbackV_1_0(CallbackConfiguration_V_1_0{chainId, recipient, gasLimit, payload})`.
  The `Callback` event is deprecated.
- The network overwrites the first argument of the payload with the requesting reactive contract's
  address. Receivers extend `AbstractCallback` and use **both** `onlyServiceProvider` (caller is the
  proxy) and `onlyCallbackSender(rvm)` (the injected address is our brain).
- The brain pays for its reactive transactions in REACT. Each vault pays for its callbacks in its own
  chain's native ETH. A contract in debt stops receiving.
- In the Omni library there is no ReactVM / network-instance split in the base contract: `react()` runs
  against the contract's own storage.
- The brain only learns about other chains through events. Any state it needs from a vault must be
  emitted by that vault.

Still to verify on chain before relying on it: the v4 `Swap` event signature on these deployments,
end-to-end callback delivery on both testnets, whether Lasna supports `cancun`, and that `subscribe()`
works when called after deployment (the brain subscribes in `configureChain`, not in its constructor,
because the vaults need the brain's address first).

Deployment order: brain (Lasna) → tokens, pool and vault on each chain (vault takes the brain's address)
→ `brain.configureChain` for each chain → `vault.bootstrap` (the brain learns the opening range from
its `Recentred` event).

## 4. Contracts

### `RespoolToken` (Unichain Sepolia + Base Sepolia)
Test-only ERC-20s (`rUSD`, `rETH`). Mint and burn restricted to the local vault. They exist so the
cross-chain move can be shown without a third-party bridge. **Labelled as test tokens everywhere.**

### `RespoolVault` (one per chain, `AbstractCallback`)
Owns one Uniswap v4 position in the Respool pool on its chain (via `PoolManager.unlock`).

- `recentre(address rvm, uint64 seq, int24 tick)` — remove the position, add it back centred on `tick`.
- `depart(address rvm, uint64 moveId, uint16 shareBps)` — remove `shareBps` of the position, burn the
  tokens, emit `Departed(moveId, amount0, amount1, dstChainId)`.
- `arrive(address rvm, uint64 moveId, uint256 amount0, uint256 amount1)` — mint, add liquidity around
  the current tick, emit `Arrived(moveId, ...)`.
- Each callback emits the origin block number / tx hash it answers, for latency joins.
- Idempotent: a `moveId` or `seq` already handled is a no-op, so a duplicate delivery cannot double-mint.

### `RespoolBrain` (Lasna, `AbstractReactive`)
Subscriptions:
- v4 `Swap` on both PoolManagers, filtered by `topic1 = poolId` of each Respool pool.
- `Recentred`, `Departed`, `Arrived` from both vaults (so it knows the live range and in-flight moves).

State per chain: last tick, vault range `[lower, upper)`, demand score (EWMA of absolute swap size),
pending recentre flag. Global: in-flight move id.

Rules (pure functions in `RespoolPolicy`, unit-tested):
- **Recentre** when `tick < lower || tick >= upper` and no recentre is pending for that chain.
- **Move** when `demand[H] * 10_000 >= demand[C] * k_bps`, vault C has liquidity, and no move in flight.
  Cooldown in blocks to prevent thrashing.
- **Arrive** on `Departed` for the in-flight move id only.

## 5. Latency method

For each loop, record three timestamps:

| Leg | Source |
|---|---|
| T0 origin event | Origin chain block of the `Swap` / `Departed` log |
| T1 reactive tx | Lasna block of the brain's `react()` tx that requested the callback |
| T2 callback | Destination chain block of the vault's callback tx |

- Block timestamps are whole seconds, which is coarser than Base Sepolia's 200 ms blocks. So an observer
  script also records **wall-clock arrival** of every log over websockets on all three chains. Both are
  reported.
- Report median and p95 over at least 30 loops per loop type, per origin chain.
- Baseline: the same loop with Ethereum Sepolia (12 s blocks) as origin, to show where the seconds go.
- Honest framing: an off-chain bot can also be fast. Respool's case is no server to run or trust, one
  place that sees both chains, and instant finality on Reactive.

## 6. Out of scope (MVP)

Real bridging of real assets, more than two chains, more than one pool per chain, hooks, mainnet.
Stretch: a v4 hook emitting `DepthLow` as an extra trigger.

## 7. Milestones (solo)

| By | Slice |
|---|---|
| Nov 15 | Foundry builds; `RespoolPolicy` unit tests green (done Nov 13) |
| Nov 19 | Tokens + vault: recentre and depart/arrive tested against a PoolManager (done Nov 13, local PoolManager rather than a fork) |
| Nov 23 | Brain deployed on Lasna; same-chain recentre loop live; first latency number (done Nov 13 on Base Sepolia: 1.4 s, n = 1) |
| Nov 27 | Base Sepolia added; cross-chain move live |
| Dec 1 | Observer + latency report (30+ loops), dashboard |
| Dec 4 | README, demo video, submission |
