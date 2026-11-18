// Plain JSON-RPC over fetch, used for reads that must not depend on the visitor's wallet node.
let nextId = 0;

export async function rpc<T = string>(url: string, method: string, params: unknown[] = [], timeoutMs = 9000): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++nextId, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

export const ethCall = (url: string, to: string, data: string) => rpc<string>(url, "eth_call", [{ to, data }, "latest"]);

/** The i-th 32-byte word of ABI-encoded return data. */
export const word = (hex: string, i = 0): bigint => BigInt("0x" + hex.slice(2 + i * 64, 66 + i * 64));

/** A number or address as a 32-byte topic. */
export const topic = (value: bigint | number | string): string =>
  "0x" + (typeof value === "string" ? value.replace(/^0x/, "").toLowerCase() : BigInt(value).toString(16)).padStart(64, "0");

export const balanceOfData = (account: string) => "0x70a08231" + topic(account).slice(2);
export const allowanceData = (owner: string, spender: string) => "0xdd62ed3e" + topic(owner).slice(2) + topic(spender).slice(2);
