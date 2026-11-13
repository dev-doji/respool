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

## Deployment used

| Contract | Chain | Address |
|---|---|---|
| RespoolBrain | Lasna (5318007) | `0x02CaDb59e8A6fe4c589eac8BF2C7B4e17A9ABE36` |
| RespoolVault | Base Sepolia (84532) | `0x276E666421b5b71F7997c75a5abA5804AB5D3761` |
| Respool pool id | Base Sepolia | `0xe2bd197c88d13a2345ada22ea1975f8ce3fde70f8419021cb3c825b37dfb6ad5` |

Full list: [deployments/](../deployments/).
