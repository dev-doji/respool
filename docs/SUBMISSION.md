# Submission text and demo-video script

Everything below is true as of 2026-11-18 and matches the README. Paste the first section into "Describe your Build".

---

## Respool: liquidity that moves to where it's needed

**Track:** Every Second Counts (Reactive Network, Unichain Sepolia and Base Sepolia). **Testnet only, play money.**

### The problem

A liquidity position on a Uniswap v4 pool stops earning when the price leaves its range, and liquidity sits on the
wrong chain while the trading happens on the other one. Fixing either by hand takes minutes of a human noticing and
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

The app (Next.js) is one simple page: a one-line "next step" that reads your balances, and two tabs, a Move panel (ETH or USDC
between Unichain and Base through the Across bridge) and a vault where a deposit stays 1:1 redeemable and earns test rewards.

### Measured latency (live testnet, block clock, not simulated)

| What | Result |
|---|---|
| Re-centre on Base Sepolia | median 1.6 s, p95 2.4 s |
| Re-centre on Unichain Sepolia | median 2.0 s, p95 3.0 s (whole-second clock) |
| Cross-chain liquidity move | median 3.4 s, p95 4.0 s (only 5 moves in that batch, so indicative) |
| Across transfer seen by Reactive | 4 s deposit to fill (n = 1) |

Four live batches were run; in every one, every swap completed its re-centre loop. Method and raw records:
`docs/LATENCY.md`, `results/`. There is no Ethereum Sepolia baseline yet.

### Key features

- Automatic re-centring of out-of-range positions, triggered by Reactive, with measured latency.
- Demand-driven cross-chain moves: balanced trading moved nothing (0 of 10 swaps); bursts moved liquidity toward the busy chain in both directions.
- Light and dark themes.
- Move ETH or USDC between Unichain Sepolia and Base Sepolia through Across, tracked to delivery.
- Reactive bridge watcher that records Across deposits and fills.
- One-page flow: get a "next step" from your own balances, move USDC to the busy chain, deposit it and watch test rewards accrue (1:1 redeemable, test token, not trading fees).
- 83 Foundry tests (policy, vault on a real v4 PoolManager, brain, simulated loop, USDC vault, earn vault, bridge watcher) and 19 web tests.

### Tech stack

Solidity 0.8.29 and Foundry; Reactive Network `reactive-lib-omni` (Lasna testnet); Uniswap v4 (PoolManager); Across testnet bridge (`depositV3`, SpokePool events); Circle test USDC; Next.js 15, React 19,
TypeScript, wagmi, viem, RainbowKit.

### Deployed (testnet)

- Earn vault, Base Sepolia: `0x687b691530d91C87061837AB2eb28156E51E0958` (reward token `0x22bD4B2D0fD6fe9b33c8822549872C547cc8568D`)
- Earn vault, Unichain Sepolia: `0x7C5c0A6615902C0a23eC53Ed1E7DF0fbbEB66203` (reward token `0x687b691530d91C87061837AB2eb28156E51E0958`)
- Brain, Lasna: `0x1BF343a05d09f578D5c248C2B05A47019a434f56`
- Bridge watcher, Lasna: `0x0A251D994D2DaE46Ef809eA83F30053BB7F6e8B0`
- Vault, Base Sepolia: `0x3cC9a15b8Fb99910746a94fc35092835B48fff3C`
- Vault, Unichain Sepolia: `0xA8e21561082E5c73eE732812a8AA4bCf6917E7fC`

### Honest limits

- Move rule tested with a driver's evenly spaced swaps and bursts, not organic trading.
- After a full crossing a vault holds one token and parks the rest in a one-sided limit position.
- Moving your own funds through the app uses Across (a third-party bridge); Reactive watches and records it, it does not
  move the funds. A real browser-wallet Move and a USDC transfer through Across have not been tested end to end.
- Earnings are **test rewards**: a worthless test token the deployer pays out (about 1,000 a day per chain, shared by depositors). They are not trading fees, and the Uniswap vault's fees are not paid to depositors. Deposits are 1:1 redeemable and never depend on the reward token.
- Test tokens and testnet chains only.

### Links

- Code: github.com/dev-doji/respool (**currently private: make it public before submitting if the hackathon requires it**)
- Demo video: _add the YouTube link here_

---

## Demo video script (about 2 minutes)

Record the browser at 1080p with any screen recorder (Windows: Win+Alt+R, or OBS). Use the dark theme for the app.

| Time | Show | Say |
|---|---|---|
| 0:00 | Landing page, hero | "Liquidity on a pool stops earning when the price leaves its range, and it sits on the wrong chain. Respool fixes both with one Reactive contract." |
| 0:15 | Landing, "How it works" and "The loop" | "Reactive watches swaps on Unichain and Base, re-centres the position, and moves liquidity to whichever chain is busier. No keeper server." |
| 0:35 | Replay a real loop on the landing page | "This is a real recorded loop on testnet: swap, Reactive reaction, callback, re-centre." |
| 0:55 | Latency section | "Four live batches. Re-centre median 1.6 seconds on Base and 2.0 on Unichain, cross-chain move 3.4 seconds. All on testnet, measured on the block clock." |
| 1:15 | `/app`, the next-step line, then the tabs | "The app is one simple page. The line at the top reads my balances and where Reactive says liquidity is needed, and tells me the one thing to do. Below, one tab to deposit and earn, one to move between chains." |
| 1:35 | Connect wallet, Move panel with a quote | "You can move ETH or USDC between the two chains; the quote, fee and delivery time come from Across." |
| 1:50 | Toggle light/dark, then the repo | "Foundry tests, deployed addresses, and raw latency records are in the repo. Everything is testnet." |
