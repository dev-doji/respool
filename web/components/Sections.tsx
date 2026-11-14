import { D, type ChainKey } from "@/lib/data";
import { NAMES, addrUrl } from "@/lib/format";
import { Reveal } from "./Reveal";

export function BuiltOn() {
  return (
    <div className="built" aria-label="Built on">
      <span className="cap">built on</span>
      <div className="marks"><span>Reactive Network</span><span>Uniswap v4</span><span>Unichain Sepolia</span><span>Base Sepolia</span></div>
    </div>
  );
}

export function How() {
  return (
    <Reveal as="section" className="sec" id="how" aria-labelledby="how-h">
      <div className="sec-head">
        <h2 id="how-h">Watch. Decide. <span className="ghost">Act.</span></h2>
        <p className="cap">three jobs, one contract on reactive, two vaults on the chains</p>
      </div>
      <ol className="steps">
        <li><span className="snum">1</span><h3>Watch</h3><p>The brain subscribes to swap events from the Respool pool on both chains, and to each vault&apos;s own events.</p></li>
        <li><span className="snum">2</span><h3>Decide</h3><p>A swap that leaves a vault&apos;s range asks for a re-centre. Recent swap activity three times higher on one chain asks for a move.</p></li>
        <li><span className="snum">3</span><h3>Act</h3><p>Reactive delivers a callback. The vault re-centres its position, or burns tokens here so the same amount can be minted on the other chain.</p></li>
      </ol>
    </Reveal>
  );
}

const LIMITS: { cls: string; title: string; body: string }[] = [
  { cls: "sky", title: "Test tokens", body: "Moved liquidity is Respool's own test tokens, burned on one chain and minted on the other. There is no real bridge and no real money." },
  { cls: "", title: "Scripted traffic", body: "Every swap in these runs came from my own script, evenly spaced. The move rule has not yet met real trading." },
  { cls: "ink", title: "A move takes seconds", body: "A burst of trading shorter than a move is over before the liquidity arrives. That bounds what this can chase." },
  { cls: "", title: "Clock resolution", body: "Base Sepolia reports milliseconds. Unichain Sepolia and Lasna report whole seconds, so their times are ±1 s." },
  { cls: "", title: "One-sided after a crossing", body: "When price runs through a position the vault holds one token. A limit position parks it beside the price instead of leaving it idle." },
  { cls: "honey", title: "No baseline yet", body: "A run with Ethereum Sepolia as the origin chain, to show what a slow origin costs, is still to do." },
];

export function Limits() {
  return (
    <Reveal as="section" className="sec" id="limits" aria-labelledby="lim-h">
      <div className="sec-head">
        <h2 id="lim-h">What it <span className="ghost">is not.</span></h2>
        <p className="cap">stated up front, so nobody has to guess</p>
      </div>
      <div className="bento">
        {LIMITS.map((l, i) => (
          <div key={l.title} className={`card ${l.cls}`}>
            <span className="num" style={l.cls === "ink" ? { color: "#8d8da6" } : l.cls === "honey" ? { color: "#44360d" } : undefined}>{String(i + 1).padStart(2, "0")}</span>
            <h3 style={{ marginTop: "auto" }}>{l.title}</h3>
            <p>{l.body}</p>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

const PROOFS: { title: string; chain: ChainKey; address: string; what: string }[] = [
  { title: "Brain", chain: "lasna", address: D.chains.lasna.brain, what: "Reactive contract" },
  { title: "Vault · Base Sepolia", chain: "base", address: D.chains.base.vault, what: "Uniswap v4 position + callbacks" },
  { title: "Vault · Unichain Sepolia", chain: "unichain", address: D.chains.unichain.vault, what: "Uniswap v4 position + callbacks" },
];

export function Proofs() {
  return (
    <Reveal as="section" className="sec" id="proof" aria-labelledby="proof-h">
      <div className="sec-head">
        <h2 id="proof-h">On chain, <span className="ghost">checkable.</span></h2>
        <p className="cap">the contracts these numbers came from</p>
      </div>
      <div className="proofs">
        {PROOFS.map((p) => (
          <a key={p.title} className="pcard" href={addrUrl(p.chain, p.address)} target="_blank" rel="noopener" aria-label={`${p.title}, open on the ${NAMES[p.chain]} explorer`}>
            <span className="pstate">live on testnet</span>
            <b>{p.title}</b>
            <span className="cap">{p.what}</span>
            <span className="mono">{p.address} ↗</span>
          </a>
        ))}
      </div>
    </Reveal>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <span>Respool · every second counts</span>
      <span>testnet only · data built {D.generatedAt.slice(0, 10)}</span>
    </footer>
  );
}
