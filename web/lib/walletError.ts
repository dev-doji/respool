// Turns whatever a wallet throws into a plain sentence plus a copyable detail string.
// Wallets report failures in many shapes: real Errors, plain {code, message} objects (including Errors from
// another JavaScript realm, which fail `instanceof Error`), viem errors with `shortMessage`, or nested causes.

type Shape = { [key: string]: unknown };
const isObject = (value: unknown): value is Shape => typeof value === "object" && value !== null;

/** The first human-readable message found in an error, looking through common nesting. */
function findMessage(error: unknown, depth = 0): string {
  if (typeof error === "string") return error;
  if (!isObject(error) || depth > 4) return "";
  for (const key of ["shortMessage", "details", "reason", "message"]) {
    const value = error[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  for (const key of ["data", "error", "cause", "info"]) {
    const found = findMessage(error[key], depth + 1);
    if (found) return found;
  }
  return "";
}

function findCode(error: unknown, depth = 0): number | string | undefined {
  if (!isObject(error) || depth > 4) return undefined;
  const code = error.code;
  if (typeof code === "number" || (typeof code === "string" && code)) return code;
  for (const key of ["error", "cause", "data", "info"]) {
    const found = findCode(error[key], depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function safeJson(error: unknown): string {
  try {
    const text = JSON.stringify(error, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2);
    return text && text !== "{}" ? text.slice(0, 700) : "";
  } catch {
    return "";
  }
}

export interface WalletProblem {
  /** One plain sentence for the visitor. */
  text: string;
  /** Raw code and message, for support. Contains no secrets: only what the wallet reported. */
  detail: string;
}

export function explainWalletError(error: unknown, networkName: string): WalletProblem {
  const code = findCode(error);
  const message = findMessage(error);
  const lower = message.toLowerCase();
  const detail = [code !== undefined ? `code: ${code}` : "", message ? `message: ${message}` : "", safeJson(error)].filter(Boolean).join("\n");

  if (code === 4001 || code === "ACTION_REJECTED" || /user (rejected|denied|cancel)|rejected the request|request rejected/.test(lower)) {
    return { text: "The wallet request was cancelled.", detail };
  }
  if (code === -32002 || /already pending|already processing/.test(lower)) {
    return { text: "Your wallet already has a request waiting. Open the wallet, finish or reject it, then try again.", detail };
  }
  if (/insufficient funds|exceeds the balance|not enough (eth|funds)/.test(lower)) {
    return { text: `Not enough ${networkName} test ETH to pay for gas. Get a little from the ETH faucet.`, detail };
  }
  if (code === 4902 || code === 4901 || /unrecognized chain|unknown chain|chain.*not (added|supported)|wrong network|chain mismatch/.test(lower)) {
    return { text: `Your wallet does not have ${networkName} set up or is on another network. Switch to ${networkName} in the wallet and try again.`, detail };
  }
  if (code === 4100 || /not authori[sz]ed|unauthori[sz]ed/.test(lower)) {
    return { text: "The wallet has not given this site permission. Disconnect, then connect again.", detail };
  }
  if (code === -32603 || /internal json-rpc|internal error|failed to fetch|network error|timeout|timed out/.test(lower)) {
    return { text: `Your wallet could not reach ${networkName}. Open the wallet's network settings for ${networkName} and check its RPC address, or try again in a moment.`, detail };
  }
  if (message) return { text: message.length > 160 ? message.slice(0, 157) + "..." : message, detail };
  return {
    text: detail
      ? "The wallet did not say why the request failed. The details below may help."
      : "The wallet did not say why the request failed. Try again, or look at the wallet's own activity log.",
    detail,
  };
}
