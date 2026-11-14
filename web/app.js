/* Respool page. No framework, no build step. Reads window.RESPOOL (web/data.js, generated from the repo's real
   deployments and measurements) and, for the Vaults section, reads the chains directly over JSON-RPC. */
(() => {
  "use strict";
  const D = window.RESPOOL;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") n.textContent = v; else if (k === "html") n.innerHTML = v; else if (k.startsWith("on")) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    [].concat(kids).forEach((c) => c && n.append(c));
    return n;
  };
  const sec = (ms, d = 1) => (ms / 1000).toFixed(d);
  const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const NAMES = { base: "Base Sepolia", unichain: "Unichain Sepolia", lasna: "Reactive Lasna" };
  const SHORT = { base: "Base", unichain: "Unichain", lasna: "Lasna" };
  const addrUrl = (c, a) => `${D.chains[c].explorer}/address/${a}`;
  const txUrl = (c, t) => `${D.chains[c].explorer}/tx/${t}`;
  const toast = (m) => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 1800); };
  const cur = D.batches.find((b) => b.current);

  /* ---------- honeycomb art ---------- */
  function comb(svg, seed) {
    const r = 17, w = Math.sqrt(3) * r; let out = "", k = 0;
    for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) {
      const cx = col * w + (row % 2 ? w / 2 : 0) + 12, cy = row * r * 1.5 + 18;
      const pts = [0, 1, 2, 3, 4, 5].map((i) => { const a = Math.PI / 180 * (60 * i - 30); return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(" ");
      const on = ((k++ * 7 + seed) % 11) === 0;
      out += `<polygon class="hx${on ? " on" : ""}" points="${pts}"${on ? ` style="animation-delay:${(k % 5) * .5}s"` : ""}/>`;
    }
    svg.innerHTML = `<g class="comb">${out}</g>`;
  }
  comb($("#comb-hero"), 3); comb($("#comb-band"), 5);

  /* ---------- hero numbers from real data ---------- */
  const moves = D.loops.filter((l) => l.kind === "move");
  $('[data-bind="moveMedian"]').textContent = `${sec(cur.moves.median)}s`;
  $('[data-bind="moveCap"]').textContent = `median cross-chain move · ${cur.moves.n} live moves, p95 ${sec(cur.moves.p95)} s`;
  if (moves.length) {
    const m = moves[moves.length - 1], to = m.swapChain, from = m.srcChain;
    $("#pill-title").textContent = `Moved ${SHORT[from]} → ${SHORT[to]}`;
    $("#pill-sub").textContent = `${sec(m.fullBlockMs)} s, recorded live on testnet`;
  }
  const stamp = $("#stamp");
  const flip = () => { stamp.textContent = "RECENTRED"; stamp.classList.add("ok"); };
  reduce ? flip() : setTimeout(flip, 1500);
  $("#foot-gen").textContent = `testnet only · data built ${new Date(D.generatedAt).toISOString().slice(0, 10)}`;

  /* ---------- loop player ---------- */
  const KINDS = [
    { id: "rb", label: "Recentre · Base", test: (l) => l.kind === "recentre" && l.swapChain === "base" },
    { id: "ru", label: "Recentre · Unichain", test: (l) => l.kind === "recentre" && l.swapChain === "unichain" },
    { id: "mv", label: "Move across chains", test: (l) => l.kind === "move" },
  ];
  const state = { kind: "rb", idx: 0, speed: 1, raf: 0 };
  const list = () => D.loops.filter(KINDS.find((k) => k.id === state.kind).test);

  function nodesFor(l) {
    const total = l.fullBlockMs, n = [];
    const node = (title, chain, tx, t, est) => n.push({ title, chain, tx, t, est });
    if (l.kind === "recentre") {
      const c = l.swapChain, t1 = l.toReactiveSeenMs, ok = t1 != null && t1 >= 0 && l.fullSeenMs > 0 && t1 <= l.fullSeenMs;
      node(`Swap on ${NAMES[c]}`, c, l.swapTx, 0, false);
      node("Brain reacts on Lasna", "lasna", l.reactiveTx, ok ? (t1 / l.fullSeenMs) * total : total / 2, ok ? "scaled" : "unknown");
      node(`Vault re-centres on ${SHORT[c]}`, c, l.callbackTx, total, false);
    } else {
      const g = l.legsSeenMs || {}, legs = [g.swapToMoveRequested, g.moveRequestedToDeparted, g.departedToArriveRequested, g.arriveRequestedToArrived];
      const ok = legs.every((x) => x != null && x >= 0) && legs.reduce((a, b) => a + b, 0) > 0, sum = legs.reduce((a, b) => a + (b || 0), 0);
      let acc = 0; const at = legs.map((x, i) => (ok ? (acc += x, (acc / sum) * total) : ((i + 1) / 4) * total));
      const est = ok ? "scaled" : "unknown", dst = l.swapChain, src = l.srcChain;
      node(`Swap on ${NAMES[dst]}`, dst, l.swapTx, 0, false);
      node("Brain asks the quiet chain to depart", "lasna", l.reactiveTx, at[0], est);
      node(`Vault burns tokens on ${SHORT[src]}`, src, l.departedTx, at[1], est);
      node("Brain asks the busy chain to arrive", "lasna", l.arriveRequestedTx, at[2], est);
      node(`Vault mints and re-opens on ${SHORT[dst]}`, dst, l.arrivedTx, total, false);
    }
    return n;
  }

  function renderNodes(l) {
    const ns = nodesFor(l), ol = $("#nodes"); ol.textContent = "";
    ns.forEach((n, i) => {
      const meta = el("div", { class: "meta" }, [el("span", { class: `chain ${n.chain}`, text: SHORT[n.chain] })]);
      if (n.tx) meta.append(el("a", { class: "mono", href: txUrl(n.chain, n.tx), target: "_blank", rel: "noopener", text: `${short(n.tx)} ↗`, "aria-label": `Open transaction ${i + 1} on the ${NAMES[n.chain]} explorer` }));
      const at = n.est === "unknown" ? "split not measured" : `${n.est ? "≈ " : "t + "}${sec(n.t, 2)} s`;
      ol.append(el("li", { class: "node", "data-t": n.t }, [el("span", { class: "ix", text: i + 1 }), el("div", {}, [el("b", { text: n.title }), meta]), el("div", { class: "at", html: `${at}<em>${n.est === "scaled" ? "wall clock, scaled" : n.est === "unknown" ? "ordering only" : "block clock"}</em>` })]));
    });
    state.nodes = ns;
  }

  function paint(t, total) {
    $("#clock").textContent = sec(t, 2);
    $("#fill").style.width = `${Math.min(100, (t / total) * 100)}%`;
    let last = -1;
    $$(".node").forEach((li, i) => { const on = +li.dataset.t <= t + 0.001; li.classList.toggle("on", on); if (on) last = i; });
    $$(".node").forEach((li, i) => li.classList.toggle("now", i === last && t < total));
  }

  function play() {
    cancelAnimationFrame(state.raf);
    const l = list()[state.idx]; if (!l) return;
    const total = l.fullBlockMs;
    if (reduce) { paint(total, total); announce(l); return; }
    const t0 = performance.now(), dur = total / state.speed;
    const tick = (now) => {
      const t = Math.min(total, ((now - t0) / dur) * total);
      paint(t, total);
      if (t < total) state.raf = requestAnimationFrame(tick); else announce(l);
    };
    paint(0, total); state.raf = requestAnimationFrame(tick);
  }
  function announce(l) {
    $("#loop-sr").textContent = `Loop finished in ${sec(l.fullBlockMs)} seconds: ${state.nodes.map((n) => n.title).join(", then ")}.`;
  }

  function select(kind, idx, autoplay = true) {
    state.kind = kind;
    const arr = list(); state.idx = Math.max(0, Math.min(arr.length - 1, idx));
    $$("#seg-kind button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === kind)));
    const l = arr[state.idx];
    $("#which").textContent = `Loop ${state.idx + 1} of ${arr.length}`;
    $("#prev").disabled = state.idx === 0; $("#next").disabled = state.idx === arr.length - 1;
    renderNodes(l);
    const scaled = state.nodes.some((n) => n.est === "scaled"), unk = state.nodes.some((n) => n.est === "unknown");
    $("#loop-total").textContent = `full loop ${sec(l.fullBlockMs, l.swapChain === "unichain" || l.kind === "move" ? 0 : 1)} s${l.swapChain === "unichain" && l.kind === "recentre" ? " (whole-second clock, ±1 s)" : ""} · swap block #${l.swapBlock.toLocaleString()}`;
    $("#loop-note").textContent = unk ? "In-between times could not be measured for this loop (one chain's clock is whole seconds), so the steps show order only." : scaled ? "The total is the chains' block clock. In-between steps are the observer's wall clock, scaled to that total." : "";
    $$(".dot").forEach((d) => d.classList.toggle("sel", d.dataset.k === kind && +d.dataset.i === state.idx));
    autoplay ? play() : paint(l.fullBlockMs, l.fullBlockMs);
  }

  const segKind = $("#seg-kind");
  KINDS.forEach((k) => segKind.append(el("button", { type: "button", "data-k": k.id, "aria-pressed": "false", text: k.label, onclick: () => select(k.id, 0) })));
  const segSpeed = $("#seg-speed");
  [["1", "Real time"], ["0.25", "Slow-mo"]].forEach(([v, t]) => segSpeed.append(el("button", { type: "button", "data-v": v, "aria-pressed": String(v === "1"), text: t, onclick: (e) => { state.speed = +v; $$("button", segSpeed).forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget))); play(); } })));
  $("#replay").addEventListener("click", play);
  $("#prev").addEventListener("click", () => select(state.kind, state.idx - 1));
  $("#next").addEventListener("click", () => select(state.kind, state.idx + 1));
  $("#loop").addEventListener("keydown", (e) => {
    if (e.target.closest("input,textarea")) return;
    if (e.key === "ArrowLeft") { select(state.kind, state.idx - 1); } else if (e.key === "ArrowRight") { select(state.kind, state.idx + 1); } else if (e.key === " " && e.target.id === "loop") { e.preventDefault(); play(); }
  });

  /* ---------- latency cards, plot, table ---------- */
  const cards = [
    { cls: "sky", title: "Recentre · Base Sepolia", s: cur.recentreBase, extra: "" },
    { cls: "", title: "Recentre · Unichain Sepolia", s: cur.recentreUnichain, extra: " · whole-second clock, ±1 s" },
    { cls: "ink", title: "Move across chains", s: cur.moves, extra: " · small sample" },
  ];
  const lc = $("#lat-cards");
  cards.forEach((c) => lc.append(el("div", { class: `card ${c.cls}`, style: "min-height:230px" }, [
    el("span", { class: "sub", text: c.title }),
    el("div", { class: "big", html: `${sec(c.s.median)}<small>s</small>` }),
    el("p", { text: `median · p95 ${sec(c.s.p95)} s · ${c.s.n} loops${c.extra}` }),
  ])));

  const MAX = 5000, plotRows = $("#plot-rows");
  KINDS.forEach((k) => {
    const arr = D.loops.filter(k.test), s = k.id === "rb" ? cur.recentreBase : k.id === "ru" ? cur.recentreUnichain : cur.moves;
    const buckets = {}; let maxStack = 1;
    const dots = arr.map((l, i) => { const b = Math.round(l.fullBlockMs / 100); const stack = buckets[b] = (buckets[b] || 0) + 1; maxStack = Math.max(maxStack, stack); return { l, i, stack }; });
    const axis = el("div", { class: "axis", style: `height:${Math.max(36, maxStack * 11 + 14)}px` });
    axis.append(el("span", { class: "med", style: `left:${(s.median / MAX) * 100}%`, "aria-hidden": "true" }), el("span", { class: "p95", style: `left:${(s.p95 / MAX) * 100}%`, "aria-hidden": "true" }));
    dots.forEach(({ l, i, stack }) => axis.append(el("button", { class: "dot", type: "button", "data-k": k.id, "data-i": i, style: `left:${(l.fullBlockMs / MAX) * 100}%;bottom:${(stack - 1) * 11 - 1}px`,
      "aria-label": `${k.label}, loop ${i + 1}: ${sec(l.fullBlockMs)} seconds. Replay it.`, title: `${sec(l.fullBlockMs)} s`, onclick: () => { select(k.id, i); $("#loop").scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); } })));
    plotRows.append(el("div", { class: "row" }, [el("div", {}, [el("b", { text: k.label, style: "font-family:var(--g);font-size:15px;letter-spacing:-.02em" }), el("div", { class: "cap dim", text: `${arr.length} loops` })]), axis]));
  });
  const scale = $("#scale"); for (let s = 0; s <= 5; s++) scale.append(el("span", { text: `${s} s` }));

  const tbl = $("#batch-table");
  const cell = (s) => (s ? `${sec(s.median)} s <span class="cap dim">(p95 ${sec(s.p95)}, n ${s.n})</span>` : "–");
  tbl.innerHTML = `<thead><tr><th>Batch</th><th>Recentre Base</th><th>Recentre Unichain</th><th>Moves</th><th>Moves went</th><th>Top-ups</th></tr></thead>` +
    `<tbody>${D.batches.map((b) => `<tr class="${b.current ? "cur" : ""}"><td><b>${b.label}</b><br><span class="cap dim">${b.note}</span></td><td>${cell(b.recentreBase)}</td><td>${cell(b.recentreUnichain)}</td><td>${cell(b.moves)}</td>` +
      `<td>${b.moves ? `${b.movesIntoBase} to Base, ${b.movesIntoUnichain} to Unichain` : "–"}</td><td>${b.topups}</td></tr>`).join("")}</tbody>`;

  /* ---------- proofs ---------- */
  const proofs = [
    ["Brain", "lasna", D.chains.lasna.brain, "Reactive contract"],
    ["Vault · Base Sepolia", "base", D.chains.base.vault, "Uniswap v4 position + callbacks"],
    ["Vault · Unichain Sepolia", "unichain", D.chains.unichain.vault, "Uniswap v4 position + callbacks"],
  ];
  proofs.forEach(([t, c, a, d]) => $("#proofs").append(el("a", { class: "pcard", href: addrUrl(c, a), target: "_blank", rel: "noopener", "aria-label": `${t}, open on the ${NAMES[c]} explorer` }, [
    el("span", { class: "pstate", text: "live on testnet" }), el("b", { text: t }), el("span", { class: "cap", text: d }), el("span", { class: "mono", text: `${a} ↗` }),
  ])));

  /* ---------- live chain reads ---------- */
  const SEL = { total: "0x15770f92", base: "0x1a686502", limit: "0xde961d93", tl: "0x59c4f905", tu: "0x55b812a8", ll: "0x51e87af7", lu: "0x0f35bcac", slot0: "0xc815641c", lastMove: "0x7e1f21d1", inFlight: "0xd2e19ad4" };
  let rid = 0;
  async function rpc(chain, method, params) {
    const r = await fetch(D.chains[chain].rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }), signal: AbortSignal.timeout(9000) });
    const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result;
  }
  const call = (chain, to, data) => rpc(chain, "eth_call", [{ to, data }, "latest"]);
  const word = (hex, i = 0) => BigInt("0x" + hex.slice(2 + i * 64, 66 + i * 64));
  const sint = (b) => Number(BigInt.asIntN(256, b));
  const fmtL = (b) => (Number(b) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 });
  const fmtTick = (n) => (n < 0 ? "−" : "") + Math.abs(n);

  async function readVault(chain) {
    const c = D.chains[chain], v = c.vault, pool = c.poolId.slice(2);
    const [total, base, limit, tl, tu, ll, lu, s0] = await Promise.all([SEL.total, SEL.base, SEL.limit, SEL.tl, SEL.tu, SEL.ll, SEL.lu].map((s) => call(chain, v, s)).concat(call(chain, c.stateView, SEL.slot0 + pool)));
    return { total: word(total), base: word(base), limit: word(limit), tl: sint(word(tl)), tu: sint(word(tu)), ll: sint(word(ll)), lu: sint(word(lu)), tick: sint(word(s0, 1)) };
  }
  async function readBrain() {
    const b = D.chains.lasna.brain;
    const [bal, last, fl] = await Promise.all([rpc("lasna", "eth_getBalance", [b, "latest"]), call("lasna", b, SEL.lastMove), call("lasna", b, SEL.inFlight)]);
    return { bal: BigInt(bal), last: Number(word(last)), inflight: Number(word(fl)) };
  }

  const vc = $("#vault-cards");
  function skeleton() {
    vc.textContent = "";
    ["base", "unichain"].forEach((c) => vc.append(el("div", { class: "vault", id: `v-${c}` }, [el("div", { class: "vault-head" }, [el("h3", { text: NAMES[c] })]), el("div", { class: "rng skel" }), el("dl", { class: "kv skel" }, [el("dt", { text: "Loading" }), el("dd", { text: "0000" })])])));
    vc.append(el("div", { class: "vault", id: "v-brain", style: "grid-column:1/-1" }, [el("div", { class: "vault-head" }, [el("h3", { text: "Brain · Reactive Lasna" })]), el("dl", { class: "kv skel" }, [el("dt", { text: "Loading" }), el("dd", { text: "0000" })])]));
  }
  function renderVault(chain, r, err) {
    const box = $(`#v-${chain}`), c = D.chains[chain]; box.textContent = "";
    const head = el("div", { class: "vault-head" }, [el("div", {}, [el("h3", { text: NAMES[chain] }), el("a", { class: "mono", style: "color:var(--real);text-decoration:none", href: addrUrl(chain, c.vault), target: "_blank", rel: "noopener", text: `vault ${short(c.vault)} ↗` })]),
      el("span", { class: "tag", html: err ? `<span class="live-dot bad"></span>unreachable` : `<span class="live-dot"></span>live` })]);
    box.append(head);
    if (err) { box.append(el("p", { class: "cap", text: `Could not read ${NAMES[chain]} from your browser (${err}). Use Refresh to retry.` })); return; }
    const hasBase = r.base > 0n, hasLimit = r.limit > 0n;
    const pts = [r.tick].concat(hasBase ? [r.tl, r.tu] : []).concat(hasLimit ? [r.ll, r.lu] : []);
    const lo = Math.min(...pts), hi = Math.max(...pts), pad = Math.max(60, (hi - lo) * 0.12), a = lo - pad, span = hi + pad - a;
    const x = (t) => `${((t - a) / span) * 100}%`, wd = (p, q) => `${((q - p) / span) * 100}%`;
    const rng = el("div", { class: "rng", role: "img", "aria-label": `Price tick ${r.tick}.${hasBase ? ` Base position ${r.tl} to ${r.tu}.` : " No base position."}${hasLimit ? ` Limit position ${r.ll} to ${r.lu}.` : ""}` });
    if (hasBase) rng.append(el("span", { class: "seg-base", style: `left:${x(r.tl)};width:${wd(r.tl, r.tu)}` }));
    if (hasLimit) rng.append(el("span", { class: "seg-limit", style: `left:${x(r.ll)};width:${wd(r.ll, r.lu)}` }));
    rng.append(el("span", { class: "px", style: `left:${x(r.tick)}`, "data-l": `tick ${fmtTick(r.tick)}` }));
    box.append(rng);
    const kv = el("dl", { class: "kv" });
    [["Total liquidity", fmtL(r.total)], ["Price tick", fmtTick(r.tick)], ["Base position", hasBase ? fmtL(r.base) : "none"], ["Limit position", hasLimit ? fmtL(r.limit) : "none"]]
      .forEach(([k, v]) => kv.append(el("div", {}, [el("dt", { text: k }), el("dd", { text: v })])));
    box.append(kv, el("p", { class: "cap dim", text: `liquidity in units of 10¹⁸. red line: price.${hasBase ? ` dark bar: balanced base position (${fmtTick(r.tl)} to ${fmtTick(r.tu)}).` : " no balanced base position right now: the vault is holding one token and has parked it beside the price."}${hasLimit ? " yellow bar: limit position." : ""}` }));
  }
  function renderBrain(r, err) {
    const box = $("#v-brain"); box.textContent = "";
    box.append(el("div", { class: "vault-head" }, [el("div", {}, [el("h3", { text: "Brain · Reactive Lasna" }), el("a", { class: "mono", style: "color:var(--real);text-decoration:none", href: addrUrl("lasna", D.chains.lasna.brain), target: "_blank", rel: "noopener", text: `brain ${short(D.chains.lasna.brain)} ↗` })]),
      el("span", { class: "tag", html: err ? `<span class="live-dot bad"></span>unreachable` : `<span class="live-dot"></span>live` })]));
    if (err) { box.append(el("p", { class: "cap", text: `Could not read Lasna (${err}).` })); return; }
    const kv = el("dl", { class: "kv", style: "grid-template-columns:repeat(3,1fr)" });
    [["lREACT left", (Number(r.bal) / 1e18).toFixed(2)], ["Moves started", String(r.last)], ["Move in flight", r.inflight ? `#${r.inflight}` : "none"]]
      .forEach(([k, v]) => kv.append(el("div", {}, [el("dt", { text: k }), el("dd", { text: v })])));
    box.append(kv);
  }
  function renderSplit(b, u) {
    const bar = $("#split-bar");
    if (!b || !u) { $("#split-note").textContent = "needs both chains"; return; }
    const tb = Number(b.total), tu = Number(u.total), t = tb + tu || 1, pb = (tb / t) * 100;
    bar.children[0].style.width = `${pb}%`; bar.children[1].style.width = `${100 - pb}%`;
    $("#split-b").textContent = `Base Sepolia ${pb.toFixed(0)}%`; $("#split-u").textContent = `Unichain Sepolia ${(100 - pb).toFixed(0)}%`;
    $("#split-note").textContent = "share of total liquidity units; moves shift this";
    bar.setAttribute("aria-label", `Liquidity share: Base Sepolia ${pb.toFixed(0)} percent, Unichain Sepolia ${(100 - pb).toFixed(0)} percent`);
  }

  let busy = false;
  async function refresh() {
    if (busy) return; busy = true;
    const btn = $("#refresh"); btn.disabled = true; btn.textContent = "Reading…";
    const dot = $("#live-tag .live-dot"); dot.className = "live-dot off"; $("#live-text").textContent = "Reading chains…";
    const res = await Promise.allSettled([readVault("base"), readVault("unichain"), readBrain()]);
    const [b, u, br] = res;
    renderVault("base", b.value, b.reason && b.reason.message); renderVault("unichain", u.value, u.reason && u.reason.message); renderBrain(br.value, br.reason && br.reason.message);
    renderSplit(b.value, u.value);
    const okN = res.filter((x) => x.status === "fulfilled").length;
    dot.className = okN === 3 ? "live-dot" : okN === 0 ? "live-dot bad" : "live-dot off";
    $("#live-text").textContent = okN === 3 ? "Live from the chains" : okN === 0 ? "Chains unreachable" : `Partly live (${okN} of 3 reachable)`;
    $("#updated").textContent = `updated ${new Date().toLocaleTimeString()}`;
    btn.disabled = false; btn.textContent = "Refresh"; busy = false;
  }
  $("#refresh").addEventListener("click", refresh);
  skeleton();
  // Read when the section scrolls near, then keep it fresh while the tab is visible.
  let started = false;
  const startLive = () => { if (started) return; started = true; refresh(); setInterval(() => { if (!document.hidden) refresh(); }, 20000); };
  "IntersectionObserver" in window ? new IntersectionObserver((e, o) => { if (e.some((x) => x.isIntersecting)) { startLive(); o.disconnect(); } }, { rootMargin: "400px" }).observe($("#vaults")) : startLive();

  /* ---------- copy, reveal ---------- */
  $("#copy").addEventListener("click", async () => {
    const text = $("#code").innerText.split("\n").filter((l) => l.startsWith("$ ")).map((l) => l.slice(2).replace(/\s+#.*$/, "")).join("\n");
    try { await navigator.clipboard.writeText(text); toast("Commands copied"); } catch { toast("Select the text and copy it"); }
  });
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.08 });
    $$(".rise").forEach((n) => io.observe(n));
  } else $$(".rise").forEach((n) => n.classList.add("in"));

  select("rb", 0, false);
  $("#loop").setAttribute("tabindex", "-1");
})();
