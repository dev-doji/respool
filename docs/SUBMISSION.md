# Submission text and demo-video script

Everything below is true as of 2026-11-25 and matches the README. Paste the first section into "Describe your Build".

---

## Respool: liquidity that moves to where it's needed

**Track:** Every Second Counts (Reactive Network). Chains: Unichain Sepolia and Base Sepolia (the Reactive loop), plus Ethereum Sepolia (earn vault) and Arbitrum Sepolia (comparison only). **Testnet only, play money.**

### The problem

A liquidity position on a Uniswap v4 pool stops earning when the price leaves its range, and liquidity sits on the
wrong chain while the trading happens on another one. Fixing either by hand takes minutes of a human noticing and
signing. Fixing it with an off-chain bot needs a server that someone has to keep running and trust.

### How it works

One reactive contract, `RespoolBrain`, lives on Reactive Network (Lasna). It subscribes to the swap events of a Uniswap v4
pool on **Unichain Sepolia** and on **Base Sepolia**.

1. A swap pushes the price out of the position's range. Reactive sees the event and calls the vault on that chain
   to **re-centre** the position.
2. Reactive keeps a decayed count of recent swaps per chain. When one chain is 3× busier (and has at least 2 recent
   swaps), Reactive tells the quiet chain's vault to **depart** and the busy chain's vault to **arrive**: liquidity moves
   to where the trading is. No keeper server.
3. A second reactive contract, `RespoolBridgeWatcher`, watches the Across bridge on both chains and records how long
   each transfer takes from deposit to delivery.

### The app

The app (Next.js) is one calm page at https://respool.foniolabs.xyz/app.

- **Chains list.** One row per testnet (Base, Unichain, Ethereum and Arbitrum Sepolia), ranked. The number is the test fees $100 would have earned in a day in that chain's busiest fee-charging Uniswap v4 pool, going by its recent trading, read live from each chain's PoolManager `Swap` events. A short suggestion under the list is written by Google Gemini from those numbers, with a fixed rule as the fallback if Gemini does not answer.
- **Deposit and earn.** Base, Unichain and Ethereum Sepolia each have an earn vault. A deposit stays 1:1 redeemable and earns test rewards; withdrawing never depends on the reward token.
- **Move between chains.** USDC or ETH between Base and Unichain through the Across bridge, tracked to delivery.
- **Activity.** Every action taken in this browser, checked against the chain by its receipt.

### Measured latency (live testnet, block clock, not simulated)

| What | Result |
|---|---|
| Re-centre on Base Sepolia | median 1.6 s, p95 2.4 s |
| Re-centre on Unichain Sepolia | median 2.0 s, p95 3.0 s (whole-second clock) |
| Cross-chain liquidity move | median 3.4 s, p95 4.0 s (only 5 moves in that batch, so indicative) |
| Across transfer seen by Reactive | 4 s deposit to fill (n = 1) |

Four live batches were run; in every one, every swap completed its re-centre loop. Method and raw records:
`docs/LATENCY.md`, `results/`. The Reactive loop was measured on Base and Unichain only; there is no Ethereum Sepolia latency baseline.

### Key features

- Automatic re-centring of out-of-range positions, triggered by Reactive, with measured latency.
- Demand-driven cross-chain moves: balanced trading moved nothing (0 of 10 swaps); bursts moved liquidity toward the busy chain in both directions.
- A four-chain comparison list built from live Uniswap v4 swap data, with a Gemini-written suggestion (fixed-rule fallback).
- Earn vaults on three chains (Base, Unichain, Ethereum Sepolia): 1:1 redeemable deposits, test rewards, claim, withdraw.
- Move ETH or USDC between Unichain Sepolia and Base Sepolia through Across, tracked to delivery.
- Reactive bridge watcher that records Across deposits and fills.
- Light and dark themes.
- 83 Foundry tests (policy, vault on a real v4 PoolManager, brain, simulated loop, USDC vault, earn vault, bridge watcher) and 33 web tests (including the chain list's swap decoding, fee maths and ranking).

### Tech stack

Solidity 0.8.29 and Foundry; Reactive Network `reactive-lib-omni` (Lasna testnet); Uniswap v4 (PoolManager); Across testnet bridge (`depositV3`, SpokePool events); Circle test USDC; Google Gemini (one short suggestion line, through a small Cloudflare Worker); Next.js 15, React 19,
TypeScript, wagmi, viem, RainbowKit; hosted on Cloudflare.

### Deployed (testnet)

- Earn vault, Base Sepolia: `0x687b691530d91C87061837AB2eb28156E51E0958` (reward token `0x22bD4B2D0fD6fe9b33c8822549872C547cc8568D`)
- Earn vault, Unichain Sepolia: `0x7C5c0A6615902C0a23eC53Ed1E7DF0fbbEB66203` (reward token `0x687b691530d91C87061837AB2eb28156E51E0958`)
- Earn vault, Ethereum Sepolia: `0x1a7e0720323d40765311A017CE24EE12990f1346` (reward token `0x02CaDb59e8A6fe4c589eac8BF2C7B4e17A9ABE36`), deployed 2026-11-25, uses Circle's test USDC `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- Brain, Lasna: `0x1BF343a05d09f578D5c248C2B05A47019a434f56`
- Bridge watcher, Lasna: `0x0A251D994D2DaE46Ef809eA83F30053BB7F6e8B0`
- Vault, Base Sepolia: `0x3cC9a15b8Fb99910746a94fc35092835B48fff3C`
- Vault, Unichain Sepolia: `0xA8e21561082E5c73eE732812a8AA4bCf6917E7fC`

### Honest limits

- Move rule tested with a driver's evenly spaced swaps and bursts, not organic trading.
- After a full crossing a vault holds one token and parks the rest in a one-sided limit position.
- Reactive manages the owner's Uniswap pool liquidity. User deposits go into the separate earn vaults, which Reactive does not manage yet; connecting the two is the next step.
- Moving your own funds through the app uses Across (a third-party bridge); Reactive watches and records it, it does not move the funds. Two Unichain to Base USDC moves made through the app were delivered; a Base to Unichain move was still pending after 25 minutes. Move works for Base and Unichain only.
- Earnings are **test rewards**: a worthless test token the deployer pays out (about 1,000 a day per chain, shared by depositors). They are not trading fees, and the Uniswap vault's fees are not paid to depositors. Deposits are 1:1 redeemable and never depend on the reward token.
- The chains list uses testnet trading, which is noisy and mostly bots, and reads only recent swaps (the last half hour, or up to about six hours on a quiet chain). It shows where test activity is, not real earnings. Arbitrum Sepolia is shown for comparison and has no vault. The Ethereum Sepolia vault was deployed and checked on chain; a deposit through a browser wallet on it has not been run by me.
- Gemini only writes the one suggestion line from the numbers shown. It does not decide or move anything.
- Test tokens and testnet chains only.

### Links

- Live app: https://respool.foniolabs.xyz/app
- Code: https://github.com/dev-doji/respool (public)
- Demo video: _add the YouTube link here_

---

## Demo video script

The full script, with a pre-recording checklist and what not to say, is in [DEMO_SCRIPT.md](DEMO_SCRIPT.md). Remember the Ethereum Sepolia vault when you narrate: three chains have a vault (Base, Unichain, Ethereum Sepolia).
