# Respool demo video script (about 3 minutes)

The one idea to land: **liquidity should sit where the trading is, and Respool watches both chains and tells you where that is.**
Everything is on testnet with play money. Say that early and once; do not keep apologising.

## Before you press record

Do these first, with the screen recorder off.

- [ ] Open https://respool.foniolabs.xyz in a clean browser window (no other tabs). Hard refresh (Ctrl+Shift+R).
- [ ] Set the app to **dark mode** (moon button) and zoom the browser to 110% so text is readable at 1080p.
- [ ] MetaMask: connected, on **Base Sepolia**, with a little test ETH on Base, Unichain and Ethereum Sepolia, and at least 5 test USDC on the chain you will deposit on.
- [ ] **Rehearse the deposit, claim and withdraw once with 1 USDC** and see each one confirm. Only film the steps that worked for you. If one failed, skip it and use the "if it fails" lines at the bottom.
- [ ] Leave the page open for a minute so the Chains list has loaded and the suggestion line has switched to "Written by Gemini". The list can take 10 to 15 seconds to read all four chains.
- [ ] Close Slack, email and anything that pops up. Hide your other wallet balances if you do not want them seen.
- [ ] Record at 1080p (Windows: Win+Alt+R, or OBS). Record in short takes; cut them together later.

## The script

Speak slowly. The "Say" column is a guide, not a poem: use your own words, keep the facts.

| Time | Show | Say |
|---|---|---|
| 0:00 | Overview page, top of the page | "Liquidity providers have two problems. When the price leaves their range, their position stops earning. And their money is often on the wrong chain, quiet, while another chain is busy. Respool uses Reactive Network to fix both, with no keeper server." |
| 0:25 | Scroll to "How it works" and "The loop" | "A Reactive contract watches swaps on Unichain and Base. When a position drifts out of range it re-centres it. When one chain is clearly busier, it moves liquidity there." |
| 0:45 | Replay one recorded loop | "This is a real loop recorded on testnet: a swap, Reactive reacting, the callback, the position re-centred." |
| 1:05 | Latency section | "Measured on the block clock, on testnet. Re-centring takes a median of 1.6 seconds on Base and 2.0 on Unichain. A cross-chain move took about 3.4 seconds, from a small batch, so treat that one as indicative." |
| 1:25 | Click **App**. Stay on the Chains list. | "This is the app. It opens with one list: the chains I support, ranked. Each number is the test fees that $100 would have earned in a day, going by the last bit of Uniswap trading on that chain." |
| 1:45 | Point at the best row and the line under the list | "The line underneath is written by Gemini from those numbers, with a fixed rule as backup. It points me at where to put my money. This is testnet trading, mostly bots, so it shows where test activity is, not real earnings." |
| 2:00 | Connect wallet. Click **Deposit** on a chain with a vault. | "Three chains have a vault today: Base, Unichain and Ethereum Sepolia. I pick one. The card shows my USDC in the wallet and what I have deposited on each chain." |
| 2:15 | Type 1 in the amount, approve if asked, then deposit. Wait for the confirmation. | "Deposit is two steps the first time: approve, then deposit. My money stays mine: it comes back 1:1 whenever I want." (Say "confirmed" only once you see it confirm.) |
| 2:35 | Rewards counter, then **Claim** | "While it is in the vault it earns test rewards, a worthless test token, not trading fees. The counter ticks up as time passes, and I can claim it." |
| 2:50 | Withdraw the 1 USDC | "And I can withdraw it any time. That does not depend on the reward token at all; there is a test for that." |
| 3:05 | **Move between chains** tab. Type an amount, **stop at the quote.** Do not press the confirm button. | "To go where the trading is, I can move USDC between Base and Unichain through the Across bridge. Here is the quote: fee and expected time. I will stop at the quote." |
| 3:20 | Activity column on the right | "Everything I did is listed here and checked against the chain." |
| 3:30 | GitHub repo page, then back to the app | "The code is public. 83 Foundry tests, 33 web tests, deployed addresses and raw latency records are in the repo. It is all testnet. Thanks for watching." |

Total is a little over three minutes. To get to two minutes, drop the replay (0:45) and the Move quote (3:05).

## Say this, not that

| Do say | Do not say |
|---|---|
| "testnet", "play money", "test rewards" | "earn real money", "APY", "yield you can withdraw" |
| "the quote" (on the Move tab) | "transfer completed", unless you really finished one and saw it arrive |
| "a median of 1.6 seconds on Base, from a small batch" | "instant", "guaranteed", "audited" |
| "Reactive moves the pool's liquidity; my deposit stays in the vault" | "Respool automatically moves my deposit" (it does not yet) |
| "it suggests where to put your money" | "it makes you money" |

## Honest limits to mention once, near the end

If you have 15 seconds, say these. Judges trust a clear limit more than a hidden one.
- The rewards are a test token paid by the vault owner, not trading fees.
- The chain list is built from testnet trading, which is noisy and mostly bots.
- Move between chains works for Base and Unichain only. Arbitrum Sepolia is shown for comparison but has no vault.
- Reactive manages the owner's pool liquidity. Connecting user deposits to that is the next step.

## If something fails on camera

- **The chain list says "reading…" for a long time:** wait up to 15 seconds. If a row says "Could not be read", say "that public node was slow; it retries by itself", and carry on.
- **The suggestion says "From a fixed rule":** say "this line is written by Gemini when it answers, with a fixed rule as backup", and carry on.
- **MetaMask shows a warning about the site:** say nothing, click through if you trust it, or re-record. Do not read the warning aloud.
- **A deposit or withdraw fails:** stop recording that take. Check the Activity column and the wallet, then redo it with a smaller amount. Do not narrate a result you did not see.
