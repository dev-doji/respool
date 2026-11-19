// The site's only server code: POST /api/explain turns the chain board's numbers into two plain sentences with
// Google Gemini. Everything else is served as static files. The key lives in a Cloudflare secret, never in the page.
//   npx wrangler secret put GEMINI_API_KEY --config wrangler.static.jsonc
// Optional variable GEMINI_MODEL (default below). Without a key the endpoint answers 503 and the page falls back to a
// rule-based sentence, so the site works either way.

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
}

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const CACHE_SECONDS = 600;

type Row = { name: string; status: "ok" | "quiet" | "error"; swapsPerHour: number; per100PerDay: number | null; canDeposit: boolean };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/** Only numbers and short chain names are accepted, so nothing a visitor types can steer the prompt. */
function cleanRows(input: unknown): Row[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 8) return null;
  const rows: Row[] = [];
  for (const r of input as Record<string, unknown>[]) {
    if (typeof r?.name !== "string" || !/^[A-Za-z0-9 ]{2,24}$/.test(r.name)) return null;
    if (r.status !== "ok" && r.status !== "quiet" && r.status !== "error") return null;
    if (typeof r.swapsPerHour !== "number" || !Number.isFinite(r.swapsPerHour)) return null;
    if (r.per100PerDay !== null && (typeof r.per100PerDay !== "number" || !Number.isFinite(r.per100PerDay))) return null;
    rows.push({ name: r.name, status: r.status, swapsPerHour: Math.round(r.swapsPerHour / 5) * 5, per100PerDay: r.per100PerDay === null ? null : Number(r.per100PerDay.toPrecision(1)), canDeposit: r.canDeposit === true });
  }
  return rows;
}

function prompt(rows: Row[]): string {
  const lines = rows.map((r) => `- ${r.name}: ${r.status === "ok" ? `${r.swapsPerHour} swaps an hour, est. ${r.per100PerDay} test-token fees per $100 per day` : r.status === "quiet" ? "too little trading to rank" : "could not be read"}; this app ${r.canDeposit ? "can" : "cannot"} deposit there`).join("\n");
  return [
    "You write for a person who is new to DeFi. Using ONLY the data below, write at most two short sentences saying which chain looks best for putting test USDC right now and why.",
    "Rules: do not invent numbers, prices or chains. Say the figures are testnet activity, not real earnings. If the best chain is one this app cannot deposit to, say so. No advice to buy anything real.",
    "Data (testnet, last half hour):",
    lines,
  ].join("\n");
}

function textOf(result: unknown): string {
  const steps = (result as { steps?: { type?: string; content?: { type?: string; text?: string }[] }[] })?.steps ?? [];
  return steps.filter((s) => s.type === "model_output").flatMap((s) => s.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(" ").trim();
}

async function explain(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "forbidden" }, 403);
  if (!env.GEMINI_API_KEY) return json({ error: "not configured" }, 503);
  let rows: Row[] | null;
  try { rows = cleanRows(await request.json()); } catch { rows = null; }
  if (!rows) return json({ error: "bad request" }, 400);

  const text = prompt(rows);
  // The same (rounded) board gets the same answer for ten minutes, which keeps the free quota from being burned by repeats.
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://cache.respool.invalid/explain/${digest}`);
  const hit = await cache.match(key);
  if (hit) return json(await hit.json());

  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY, "Api-Revision": "2026-05-20" },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch { return json({ error: "upstream unreachable" }, 502); }
  if (!res.ok) return json({ error: "upstream error", status: res.status }, 502);
  const answer = textOf(await res.json().catch(() => null)).slice(0, 600);
  if (!answer) return json({ error: "empty answer" }, 502);
  const body = { text: answer, model };
  await cache.put(key, new Response(JSON.stringify(body), { headers: { "cache-control": `max-age=${CACHE_SECONDS}` } }));
  return json(body);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/explain") return request.method === "POST" ? explain(request, env) : json({ error: "method not allowed" }, 405);
    return env.ASSETS.fetch(request);
  },
};
