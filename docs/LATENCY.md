# Latency log

Live measurements of Respool loops. Method: [SPEC.md section 5](SPEC.md#5-latency-method).

## Sample 1: recentre loop on Base Sepolia (2026-11-13), n = 1

A swap on Base Sepolia pushed the price from tick 0 to tick -600, outside the vault's range [-120, 180).
RespoolBrain on Lasna requested a recentre; the vault moved its position to [-720, -420).

| Leg | Chain | Block | Timestamp | Tx |
|---|---|---|---|---|
| T0 swap | Base Sepolia | 58412295 | 1794604327.800 s | `0x2e150a2460bd1de299f99ab094088b0d423fdabc3c62120523a7a7640ac431fa` |
| T1 brain `react()` (`RecentreRequested`) | Lasna | 8274963 | 1794604327 s (whole seconds) | `0x6cc0ebcf8fc23bf8df79aed454fc7c963688b608916aa218d8becf8b8a9aca50` |
| T2 vault `recentre` callback (`Recentred`) | Base Sepolia | 58412302 | 1794604329.200 s | `0xbe1f316b32a25b7033dcdfd2c1204d9f8980fdb7e54a8add5cc7d0613903db04` |

**Full loop T2 − T0 = 1,400 ms = 7 Base Sepolia blocks.** Both timestamps come from Base Sepolia's
`timestampMs` block field, so this figure does not depend on clocks agreeing across chains.

The `trigger` field in the vault's `Recentred` event equals the swap's tx hash, so the legs are joined by
hash, not by guessing.

**Not yet resolved:** how the 1.4 s splits between T0→T1 and T1→T2. Lasna block timestamps are whole
seconds, and T1's block carries the same second as the swap (it reads 0.8 s *before* T0, which only
means the clocks can't be compared at this resolution). The wall-clock observer in the spec is needed to
split the legs. One sample is not a distribution: median and p95 over 30+ loops are still to do.

## Batch 1: 31 swaps, Base Sepolia + Unichain Sepolia (2026-11-13)

Recorded by [observer/observe.mjs](../observer/observe.mjs): one smoke-test swap on Base, then
`node observer/observe.mjs run --chains base,unichain --runs 30` (alternating chains, alternating
direction, 500 test tokens per swap, price limit 600 ticks). Raw data:
[results/loops.jsonl](../results/loops.jsonl), console log: [results/run-2026-11-13.log](../results/run-2026-11-13.log).
Reproduce the table with `node observer/observe.mjs summary`.

**Every swap produced a completed recentre loop (31 of 31). No callback failed or timed out.**

### Full loop, block clock (the reliable number)

| Loop | n | median | p95 | min | max |
|---|---|---|---|---|---|
| Recentre, Base Sepolia | 16 | **1.6 s** | 3.0 s | 1.0 s | 3.0 s |
| Recentre, Unichain Sepolia | 15 | **2.0 s** | 3.0 s | 2.0 s | 3.0 s |
| Cross-chain move, Unichain → Base | 9 | **3.8 s** | 4.2 s | 2.2 s | 4.2 s |

- Recentre: swap block → vault `Recentred` block, same chain. Base gives millisecond block times;
  Unichain gives whole seconds, so Unichain values are multiples of 1 s (±1 s).
- Cross-chain move: swap on Base → `Departed` on Unichain → `Arrived` on Base. Two Reactive round
  trips; both ends on Base's millisecond clock. Hops: Base → Lasna → Unichain → Lasna → Base.

### Where the time goes (observer wall clock, Base recentre loops)

| Leg | median | p95 |
|---|---|---|
| Swap on Base → brain's `react()` tx seen on Lasna | 1.05 s | 2.2 s |
| Brain's `react()` → vault callback seen on Base | 0.57 s | 1.4 s |

Wall-clock times include each chain's polling interval (100–200 ms) and RPC lag. **Legs involving
Unichain are not reliable**: its public RPC repeatedly reported a head block it could not yet serve logs
for, so Unichain events were seen late, which produced impossible negative legs (e.g. −4.2 s). Those
legs are left in the raw data and excluded from the claims above.

### Things the runs showed

- **Duplicate callback delivered live, and handled.** On the smoke-test move, the `depart` callback for
  move #1 was delivered twice to the Unichain vault, about 6 s apart, in two separate proxy
  transactions (`0xdacf680d…` and `0xbbbb12a1…`). The brain requested it once. The vault's idempotency
  check skipped the second (`CallbackSkipped`, reason 3), so no tokens were burned twice. No further
  duplicates were seen in the next 9 moves.
- **Moves only went toward Base in this batch.** The demand rule fired 9 times, always Unichain → Base.
  Demand is measured by |amount0| per swap, and with alternating equal-sized swaps the two chains sit
  right at the 2× threshold, so small differences in swap size decide the direction. Not yet tuned.
- **Recentring drains in-range liquidity.** When price crosses a position completely, the vault ends up
  holding one token, and re-centring can only use as much as the scarcer token allows. The driver
  topped vaults up 13 times (owner `bootstrap`, minting 50 test tokens per side) when liquidity fell
  below 100 tokens; each top-up is logged in the raw data. A real vault would swap its idle inventory
  back toward 50/50; that is not built.

## Deployment used

| Contract | Chain | Address |
|---|---|---|
| RespoolBrain | Lasna (5318007) | `0x02CaDb59e8A6fe4c589eac8BF2C7B4e17A9ABE36` |
| RespoolVault | Base Sepolia (84532) | `0x276E666421b5b71F7997c75a5abA5804AB5D3761` |
| Respool pool id | Base Sepolia | `0xe2bd197c88d13a2345ada22ea1975f8ce3fde70f8419021cb3c825b37dfb6ad5` |
| RespoolVault | Unichain Sepolia (1301) | `0x92D11779756817E2587E8d2C47A31B9BD282512C` |
| Respool pool id | Unichain Sepolia | `0x2abcc1e957a54deb87829d1751acc0b7b7001f0cf5769e374da3c48363493c85` |

Full list: [deployments/](../deployments/).
