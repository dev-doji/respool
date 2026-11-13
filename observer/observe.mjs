#!/usr/bin/env node
// Respool latency observer. No dependencies (Node 18+).
//
//   node observer/observe.mjs watch                       record loops until Ctrl+C
//   node observer/observe.mjs run --chains base,unichain --runs 30
//                                                         drive swaps (forge script) and record each loop
//   node observer/observe.mjs summary                     median / p95 from results/loops.jsonl
//
// For every event it records two clocks:
//   blockMs  the chain's block timestamp (Base Sepolia gives milliseconds; Unichain Sepolia and Lasna give
//            whole seconds, so their values are +-1 s)
//   seenMs   this machine's wall clock when the observer first saw the log over HTTP polling (includes the
//            poll interval and RPC lag, roughly the same on every leg)
// Loops are joined by the `trigger` field Respool puts in every callback (the origin tx hash), not by timing.

import { readFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
// RESULTS_FILE picks the output file (default results/loops.jsonl), so separate batches stay separate.
const RESULTS = process.env.RESULTS_FILE ? join(ROOT, process.env.RESULTS_FILE) : join(ROOT, "results", "loops.jsonl");

const TOPIC = {
  Swap: "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f",
  RecentreRequested: "0x13091ed157a3ee6ff40e35fae19340b1e8296f0801440f5e2900be772e819cd4",
  MoveRequested: "0xf22fc5f30fc3dbcee8fe373c48042df3287b904fb63a3e18ed0ed9fc5d2db2e9",
  ArriveRequested: "0xe7d25ea5cf18917e8d7687c9db482cae29105977b72c5d46ffade4002b88fe13",
  MoveCompleted: "0xc72bf45af2c6206cc376114d97783f9652fac51f6d099a473fcbdd6f4f9caa0c",
  Recentred: "0x79416ef988e75c3bec7235e2ac6d81db13673fd2db6b4780815f822101574ef5",
  Departed: "0x225ea6c99650a68cfe4c1440c49b70c77a2a804d3799353c185ac93d8ea49264",
  Arrived: "0x9a8c3521778d238c6014079336e8ed7f355e02eb4e4b47e44069c4c18c29f9cb",
  CallbackSkipped: "0xe8c2d6fc461477af30fb180f8c6b5a5b64d2b795cebb13ccd392f2345f299e15",
};
const NAME = Object.fromEntries(Object.entries(TOPIC).map(([k, v]) => [v, k]));
const LIQUIDITY_SELECTOR = "0x15770f92"; // totalLiquidity(): base + limit position

function readEnv() {
  const env = { ...process.env };
  const p = join(ROOT, ".env");
  if (existsSync(p)) {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].trim();
    }
  }
  return env;
}
const ENV = readEnv();
const dep = (id) => JSON.parse(readFileSync(join(ROOT, "deployments", `${id}.json`), "utf8"));

function chains() {
  const brain = dep(5318007).brain;
  const out = {
    lasna: { name: "lasna", id: 5318007, url: ENV.LASNA_RPC || "https://lasna-rpc.rnk.dev/", pollMs: 200,
      addresses: [brain], topics: [TOPIC.RecentreRequested, TOPIC.MoveRequested, TOPIC.ArriveRequested, TOPIC.MoveCompleted] },
  };
  const add = (name, id, url, pollMs) => {
    if (!existsSync(join(ROOT, "deployments", `${id}.json`))) return;
    const d = dep(id);
    out[name] = { name, id, url, pollMs, vault: d.vault, poolId: d.poolId.toLowerCase(),
      addresses: [d.poolManager, d.vault],
      topics: [TOPIC.Swap, TOPIC.Recentred, TOPIC.Departed, TOPIC.Arrived, TOPIC.CallbackSkipped] };
  };
  add("base", 84532, ENV.BASE_SEPOLIA_RPC || "https://sepolia.base.org", 100);
  add("unichain", 1301, ENV.UNICHAIN_SEPOLIA_RPC || "https://sepolia.unichain.org", 150);
  return out;
}

let rpcId = 0;
async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

const now = () => performance.timeOrigin + performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const trigger = (data) => "0x" + data.slice(-64);

// ---------------------------------------------------------------------------------------------- watcher

class Watcher {
  constructor(chain, onEvent) {
    this.c = chain;
    this.onEvent = onEvent;
    this.last = null;
    this.blockTimes = new Map();
    this.stopped = false;
  }
  async blockMs(num) {
    if (this.blockTimes.has(num)) return this.blockTimes.get(num);
    const b = await rpc(this.c.url, "eth_getBlockByNumber", ["0x" + num.toString(16), false]);
    const ms = b.timestampMs ? Number(BigInt(b.timestampMs)) : Number(BigInt(b.timestamp)) * 1000;
    this.blockTimes.set(num, ms);
    return ms;
  }
  async loop() {
    while (!this.stopped) {
      try {
        const head = Number(BigInt(await rpc(this.c.url, "eth_blockNumber", [])));
        if (this.last === null) this.last = head;
        if (head > this.last) {
          const seen = now();
          const from = this.last + 1;
          const to = Math.min(head, from + 200);
          const logs = await rpc(this.c.url, "eth_getLogs", [{
            fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16),
            address: this.c.addresses, topics: [this.c.topics],
          }]);
          for (const l of logs) {
            const name = NAME[l.topics[0]];
            if (name === "Swap" && l.topics[1].toLowerCase() !== this.c.poolId) continue;
            const block = Number(BigInt(l.blockNumber));
            this.onEvent({ chain: this.c.name, name, tx: l.transactionHash.toLowerCase(), block,
              blockMs: await this.blockMs(block), seenMs: seen, trigger: name === "Swap" ? null : trigger(l.data).toLowerCase(),
              topic1: l.topics[1], data: l.data });
          }
          this.last = to;
        }
      } catch (e) {
        if (!this.stopped) process.stderr.write(`[${this.c.name}] ${e.message}\n`);
      }
      await sleep(this.c.pollMs);
    }
  }
}

// ---------------------------------------------------------------------------------------------- loop assembly

// Joins events into loops by trigger hash. Events can arrive in any order (each chain is polled
// separately), so everything is stored first and a loop is closed once its legs are present.
//   recentre loop: Swap(tx S) -> RecentreRequested(trigger S) -> Recentred(trigger S)
//   move loop:     Swap(tx S) -> MoveRequested(trigger S) -> Departed(tx D, trigger S)
//                  -> ArriveRequested(trigger D) -> Arrived(trigger D)
const GRACE_MS = 5000; // wait this long for a missing middle leg before closing a loop without it

class Assembler {
  constructor() {
    this.swaps = new Map(); // swap tx -> Swap event
    this.byTrigger = new Map(); // trigger -> events carrying it
    this.departedToSwap = new Map(); // Departed tx -> swap tx
    this.closed = new Set(); // "kind:swapTx"
    this.timers = new Map();
    this.done = [];
    this.listeners = [];
  }
  first(trigger, name) {
    return (this.byTrigger.get(trigger) || []).find((e) => e.name === name);
  }
  ev(e) {
    const tag = e.name === "Swap" ? e.tx.slice(0, 10) : (e.trigger || "").slice(0, 10);
    console.log(`${new Date(e.seenMs).toISOString().slice(11, 23)} ${e.chain.padEnd(8)} ${e.name.padEnd(18)} #${e.block} ${tag}`);

    if (e.name === "Swap") {
      this.swaps.set(e.tx, e);
      return this.tryClose(e.tx);
    }
    if (!this.byTrigger.has(e.trigger)) this.byTrigger.set(e.trigger, []);
    this.byTrigger.get(e.trigger).push(e);

    if (e.name === "CallbackSkipped") {
      // The vault refused a callback (1 = stale seq, 2 = already in range, 3 = duplicate delivery).
      const reason = Number(BigInt("0x" + e.data.slice(2, 66)));
      mkdirSync(dirname(RESULTS), { recursive: true });
      appendFileSync(RESULTS, JSON.stringify({ kind: "skipped", chain: e.chain, reason, trigger: e.trigger, tx: e.tx,
        id: Number(BigInt(e.topic1)), recordedAt: new Date().toISOString() }) + "\n");
      console.log(`  => vault skipped a callback on ${e.chain} (reason ${reason}${reason === 3 ? ": duplicate delivery" : ""})`);
    }
    if (e.name === "Departed") this.departedToSwap.set(e.tx, e.trigger);
    const swapTx = this.swaps.has(e.trigger) || this.first(e.trigger, "MoveRequested") || this.first(e.trigger, "RecentreRequested")
      ? e.trigger
      : this.departedToSwap.get(e.trigger);
    if (swapTx) this.tryClose(swapTx);
  }
  tryClose(swapTx) {
    const sw = this.swaps.get(swapTx);
    if (!sw) return;
    // recentre
    const rr = this.first(swapTx, "RecentreRequested"), rc = this.first(swapTx, "Recentred");
    if (rc) this.closeWhen("recentre", swapTx, !!rr, () => this.recentreRec(sw, rr, rc));
    // move
    const m = this.first(swapTx, "MoveRequested"), d = this.first(swapTx, "Departed");
    const ar = d && this.first(d.tx, "ArriveRequested"), v = d && this.first(d.tx, "Arrived");
    if (d && v) this.closeWhen("move", swapTx, !!(m && ar), () => this.moveRec(sw, m, d, ar, v));
  }
  closeWhen(kind, swapTx, complete, build) {
    const key = `${kind}:${swapTx}`;
    if (this.closed.has(key)) return;
    if (!complete) {
      if (!this.timers.has(key)) this.timers.set(key, setTimeout(() => this.emit(key, build()), GRACE_MS));
      return;
    }
    clearTimeout(this.timers.get(key));
    this.emit(key, build());
  }
  emit(key, rec) {
    if (this.closed.has(key)) return;
    this.closed.add(key);
    mkdirSync(dirname(RESULTS), { recursive: true });
    appendFileSync(RESULTS, JSON.stringify(rec) + "\n");
    console.log(`  => LOOP ${rec.kind} into ${rec.swapChain}: full ${rec.fullBlockMs} ms (block clock), ${rec.fullSeenMs} ms (wall clock)`);
    this.done.push(rec);
    this.listeners.forEach((f) => f(rec));
  }
  base(kind, sw) {
    return { kind, swapChain: sw.chain, swapTx: sw.tx, swapBlock: sw.block, recordedAt: new Date().toISOString() };
  }
  recentreRec(sw, rr, rc) {
    return Object.assign(this.base("recentre", sw), {
      reactiveTx: rr?.tx ?? null, callbackTx: rc.tx,
      fullBlockMs: rc.blockMs - sw.blockMs, fullBlocks: rc.block - sw.block,
      fullSeenMs: Math.round(rc.seenMs - sw.seenMs),
      toReactiveSeenMs: rr ? Math.round(rr.seenMs - sw.seenMs) : null,
      toCallbackSeenMs: rr ? Math.round(rc.seenMs - rr.seenMs) : null,
    });
  }
  moveRec(sw, m, d, ar, v) {
    const gap = (a, b) => (a && b ? Math.round(b.seenMs - a.seenMs) : null);
    return Object.assign(this.base("move", sw), {
      srcChain: d.chain, moveRequestedTx: m?.tx ?? null, departedTx: d.tx, arriveRequestedTx: ar?.tx ?? null, arrivedTx: v.tx,
      fullBlockMs: v.blockMs - sw.blockMs, fullSeenMs: Math.round(v.seenMs - sw.seenMs),
      legsSeenMs: {
        swapToMoveRequested: gap(sw, m),
        moveRequestedToDeparted: gap(m, d),
        departedToArriveRequested: gap(d, ar),
        arriveRequestedToArrived: gap(ar, v),
      },
    });
  }
  waitFor(pred, timeoutMs) {
    return new Promise((resolve) => {
      const h = (rec) => { if (pred(rec)) { clearTimeout(t); this.listeners = this.listeners.filter((f) => f !== h); resolve(rec); } };
      const t = setTimeout(() => { this.listeners = this.listeners.filter((f) => f !== h); resolve(null); }, timeoutMs);
      this.listeners.push(h);
    });
  }
}

function start() {
  const cs = chains();
  const asm = new Assembler();
  const ws = Object.values(cs).map((c) => new Watcher(c, (e) => asm.ev(e)));
  ws.forEach((w) => w.loop());
  return { cs, asm, stop: () => ws.forEach((w) => (w.stopped = true)) };
}

// ---------------------------------------------------------------------------------------------- driver

const RPC_ALIAS = { base: "base_sepolia", unichain: "unichain_sepolia" };

function forge(script, rpcAlias, extraEnv) {
  return new Promise((resolve) => {
    // Fixed arguments only (no user input), so one command string is safe; Windows needs a shell to find forge.
    const cmd = `forge script script/${script} --rpc-url ${rpcAlias} --broadcast -q`;
    const p = spawn(cmd, { cwd: ROOT, env: { ...process.env, ...extraEnv }, shell: true });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, err }));
  });
}

async function vaultLiquidity(c) {
  const r = await rpc(c.url, "eth_call", [{ to: c.vault, data: LIQUIDITY_SELECTOR }, "latest"]);
  return BigInt(r);
}

async function run(args) {
  const runs = Number(args.runs || 30);
  const names = (args.chains || "base").split(",");
  const { cs, asm, stop } = start();
  for (const n of names) if (!cs[n]) throw new Error(`chain ${n} not deployed`);
  await sleep(2000); // let watchers learn the head block
  const dir = {};
  for (let i = 0; i < runs; i++) {
    const n = names[i % names.length];
    const c = cs[n];
    if ((await vaultLiquidity(c)) < 10n ** 20n) {
      console.log(`  (top-up: ${n} vault total liquidity low, running Bootstrap with 50 test tokens per side)`);
      appendFileSync(RESULTS, JSON.stringify({ kind: "topup", chain: n, at: new Date().toISOString() }) + "\n");
      await forge("Bootstrap.s.sol", RPC_ALIAS[n], { SEED_WEI: String(50n * 10n ** 18n) });
    }
    dir[n] = !dir[n]; // alternate direction per chain so every swap leaves the fresh range
    console.log(`run ${i + 1}/${runs}: swap on ${n} (${dir[n] ? "down" : "up"})`);
    const before = asm.done.length;
    const r = await forge("Swap.s.sol", RPC_ALIAS[n], { SWAP_WEI: String(500n * 10n ** 18n), LIMIT_TICKS: "600", ZERO_FOR_ONE: String(dir[n]) });
    if (r.code !== 0) { console.log(`  swap failed: ${r.err.trim().split("\n").pop()}`); continue; }
    const rec = await asm.waitFor((x) => x.kind === "recentre" && x.swapChain === n, 60000);
    if (!rec) console.log("  no recentre loop seen within 60 s");
    await sleep(3000); // let any move loop from this swap finish being recorded
    if (asm.done.length === before) console.log("  (no loop completed for this swap)");
  }
  await sleep(10000);
  stop();
  summary();
}

// ---------------------------------------------------------------------------------------------- summary

function pct(xs, p) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
function stats(label, xs) {
  xs = xs.filter((x) => typeof x === "number");
  if (!xs.length) return;
  console.log(`  ${label.padEnd(34)} n=${String(xs.length).padEnd(3)} median ${String(pct(xs, 50)).padStart(6)} ms   p95 ${String(pct(xs, 95)).padStart(6)} ms   min ${Math.min(...xs)}  max ${Math.max(...xs)}`);
}
function summary() {
  if (!existsSync(RESULTS)) return console.log("no results yet");
  const recs = readFileSync(RESULTS, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  for (const chain of ["base", "unichain"]) {
    const r = recs.filter((x) => x.kind === "recentre" && x.swapChain === chain);
    if (r.length) {
      console.log(`recentre loops on ${chain}:`);
      stats("full, block clock", r.map((x) => x.fullBlockMs));
      stats("full, wall clock", r.map((x) => x.fullSeenMs));
      stats("swap -> brain react (wall)", r.map((x) => x.toReactiveSeenMs));
      stats("brain react -> callback (wall)", r.map((x) => x.toCallbackSeenMs));
    }
    const m = recs.filter((x) => x.kind === "move" && x.swapChain === chain);
    if (m.length) {
      console.log(`cross-chain moves into ${chain}:`);
      stats("full, block clock", m.map((x) => x.fullBlockMs));
      stats("full, wall clock", m.map((x) => x.fullSeenMs));
      for (const k of ["swapToMoveRequested", "moveRequestedToDeparted", "departedToArriveRequested", "arriveRequestedToArrived"])
        stats(k + " (wall)", m.map((x) => x.legsSeenMs[k]));
    }
  }
  const t = recs.filter((x) => x.kind === "topup").length;
  if (t) console.log(`vault top-ups during runs: ${t}`);
}

// ---------------------------------------------------------------------------------------------- main

const [cmd, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i += 2) args[rest[i].replace(/^--/, "")] = rest[i + 1];
if (cmd === "watch") start();
else if (cmd === "run") run(args).catch((e) => { console.error(e); process.exit(1); });
else if (cmd === "summary") summary();
else console.log("usage: node observer/observe.mjs watch | run --chains base,unichain --runs 30 | summary");
