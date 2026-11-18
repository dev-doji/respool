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
- **Moves only went toward Base in this batch.** The demand rule fired 9 times, always Unichain → Base,
  although the driver alternated equal-sized swaps between the chains. Cause diagnosed in batches 3 and 4
  below (the first guess recorded here, that swap size decided it, was incomplete).
- **Recentring drains in-range liquidity.** When price crosses a position completely, the vault ends up
  holding one token, and re-centring can only use as much as the scarcer token allows. The driver
  topped vaults up 13 times (owner `bootstrap`, minting 50 test tokens per side) when liquidity fell
  below 100 tokens; each top-up is logged in the raw data. A real vault would swap its idle inventory
  back toward 50/50; that is not built.

## Batch 2: 30 swaps after the drain fix (2026-11-13)

Same driver and settings as batch 1, against new vaults that park leftover tokens in a one-sided limit
position (commit `d7d4bd7`). Same brain. Raw data: [results/loops-v2.jsonl](../results/loops-v2.jsonl),
log: [results/run-2026-11-13-v2.log](../results/run-2026-11-13-v2.log). Reproduce with
`RESULTS_FILE=results/loops-v2.jsonl node observer/observe.mjs summary`.

**30 of 30 swaps completed a recentre loop. No callback failed or timed out.**

| Loop | n | median | p95 | min | max |
|---|---|---|---|---|---|
| Recentre, Base Sepolia | 15 | **1.4 s** | 2.6 s | 1.0 s | 2.6 s |
| Recentre, Unichain Sepolia | 15 | **2.0 s** | 3.0 s | 2.0 s | 3.0 s |
| Cross-chain move, Unichain → Base | 15 | **3.6 s** | 4.6 s | 3.0 s | 4.6 s |

Base wall-clock split: swap → brain `react()` median 1.0 s, brain → callback median 0.42 s.

### Drain: before and after

| | Batch 1 (old vault) | Batch 2 (limit position) |
|---|---|---|
| Top-ups needed | 13 (6 Base, 7 Unichain) | **2 (both Unichain)** |
| Tokens left idle after a recentre | yes, the unused token | none (dust only), checked by `test_oscillation_keepsInventoryDeployed` |

The two remaining top-ups are not the drain: all 15 moves went Unichain → Base and each move takes half
of the source vault, so Unichain was emptied by design. The Base vault, which received every move,
needed no top-up and ended with base liquidity 4.2e21 plus limit liquidity 3.0e22.

**What the fix does not do:** a recentre happens only after price has left the range, at which point the
base position is entirely one token. Without an outside venue to swap against (on these testnets the
Respool pool is the only liquidity), the vault cannot rebuild a two-sided base right at the new price.
The limit position keeps that inventory in the pool beside the price, and traders convert it back when
price returns. Moves again only went toward Base (see batches 3 and 4 for why and the fix).

## Batches 3 and 4: making liquidity follow demand (2026-11-14)

Batches 1 and 2 moved liquidity toward Base 24 times out of 24, under trading that alternated
evenly between the chains. A rule that always picks one side is not "liquidity that moves to where it is
needed", so the demand rule was reworked twice. Both live batches ran the same two parts: **balanced**
(10 swaps alternating between chains, no chain busier than the other) and **burst** (24 swaps in blocks of
6: 6 on Unichain, 6 on Base, repeating). Raw data: `results/loops-v3-*.jsonl`, `results/loops-v4-*.jsonl`
and the matching `run-*.log` files.

**Batch 3, demand as time-decayed swap volume (brain v3).** The old score added each swap to its chain and
halved the other chain's, which left the busy chain at exactly the 2× threshold after every swap. v3
scored recent swap volume, faded by Reactive blocks, on both chains alike, with a 3× threshold. Result:
every move went to **Unichain** (5 of 5 balanced, 6 of 6 burst), including during the Base bursts. The
switch from always-Base to always-Unichain, with a fresh deployment each time, points at the signal
rather than the driver: each swap is price-limited, so it trades whatever liquidity sits in its path, and
"volume" measured how deep the pool was, not how busy. That is an inference from the pattern; I did not
record per-swap volumes to prove it.

**Batch 4, demand as time-decayed swap count (brain v4, current).** Each swap adds one unit, faded by
Reactive blocks, on both chains alike. Move threshold 3×, noise floor about two recent swaps.

| Part | Swaps | Moves | Direction |
|---|---|---|---|
| Balanced (alternating) | 10 | **0** | none |
| Burst, 4 blocks of 6 | 24 | **5** | Unichain→Base x2 and Base→Unichain x3, each right after the burst that caused it |

Moves followed the bursts: a burst on Unichain pulled liquidity from Base, then a burst on Base pulled it
back, and so on, in both directions. 34 of 34 swaps completed their recentre loop, 5 of 5 moves completed,
and no vault top-up was needed.

| Batch 4 loop | n | median | p95 |
|---|---|---|---|
| Recentre, Base Sepolia | 17 | 1.6 s | 2.4 s |
| Recentre, Unichain Sepolia | 17 | 2.0 s | 3.0 s |
| Cross-chain move (either direction) | 5 | 3.4 s | 4.0 s |

The recentre figures combine the balanced and burst parts (5 + 12 per chain). Five moves is a small
sample, so treat the move median as indicative.

On-chain tests lock the behaviour in: balanced alternating trading moves nothing, bursts move liquidity
both ways, and 100-token swaps on one chain against 1-token swaps on the other move nothing
(`test/RespoolBrain.t.sol`).

## Bridge test: Across, Unichain Sepolia to Base Sepolia (2026-11-18), n = 1

Not part of Respool yet. A feasibility test of the bridge a future "move my funds" feature would use underneath.
One real transfer of **0.001 ETH** from the deployer wallet, through Across's testnet SpokePool on each chain
(`depositV3` on Unichain with the quote from Across's testnet API, simulated first, then sent).

| Step | Chain | Detail |
|---|---|---|
| Deposit | Unichain Sepolia | tx `0xa6cff1c93073d9c7be88ea8c9ff58a5a9c7c75a6174af082a4b5d5be084cd7eb`, block 68156399, chain time 1795008827 s |
| Fill | Base Sepolia | tx `0x49920ad7628da6fade37a8976e0fdfabe824d0fe7fcefa8c38bb78b3138e6bc6`, block 60434804, chain time 1795008829.6 s |

- **Deposit to fill: about 2 to 3 s** on the chains' own clocks (Unichain's clock is whole seconds, so ±1 s). A 1-second
  polling check from the deposit's confirmation to the funds appearing on Base measured 3.4 s. Across's quote
  had estimated 10 s.
- **Amount received:** 0.000997616530340222 ETH, exactly the quote's output amount, so the fee was 0.238%.
- Across quoted routes for ETH (native), WETH and USDC in both directions between these two chains, with testnet limits of
  about 8 USDC or 0.0045 ETH per transfer. Only the ETH route was actually sent.
- Across's own status endpoint did not know this deposit (testnet indexer), so the fill was found directly from the
  Base SpokePool's fill event for origin chain 1301, deposit ID 6100.
- One sample, one asset, tiny amount. It shows the route works and is fast, not that it is reliable under load. Across's docs
  warn that unfilled testnet deposits are not refunded automatically.

## Deployment used

| Contract | Chain | Address |
|---|---|---|
| RespoolBrain | Lasna (5318007) | `0x02CaDb59e8A6fe4c589eac8BF2C7B4e17A9ABE36` |
| RespoolVault | Base Sepolia (84532) | `0x276E666421b5b71F7997c75a5abA5804AB5D3761` |
| Respool pool id | Base Sepolia | `0xe2bd197c88d13a2345ada22ea1975f8ce3fde70f8419021cb3c825b37dfb6ad5` |
| RespoolVault | Unichain Sepolia (1301) | `0x92D11779756817E2587E8d2C47A31B9BD282512C` |
| Respool pool id | Unichain Sepolia | `0x2abcc1e957a54deb87829d1751acc0b7b7001f0cf5769e374da3c48363493c85` |

Those contracts were used for sample 1 and batch 1. Batch 2 used another pair of vaults with the same
brain. Batches 3 and 4 each used a new brain and new vaults; the current set (batch 4) is in
[deployments/](../deployments/): brain `0x1BF343a05d09f578D5c248C2B05A47019a434f56` on Lasna, vaults
`0x3cC9a15b8Fb99910746a94fc35092835B48fff3C` (Base Sepolia) and `0xA8e21561082E5c73eE732812a8AA4bCf6917E7fC`
(Unichain Sepolia).

Full list: [deployments/](../deployments/).
