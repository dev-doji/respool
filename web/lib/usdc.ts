// Test USDC has 6 decimals. Amounts are bigints in base units and are never floats.
export const SCALE = 1_000_000n;

/** 1234500000n -> "1234.5" */
export function format(value: bigint): string {
  const fraction = (value % SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return (value / SCALE).toString() + (fraction ? "." + fraction : "");
}

/** "12.5" -> 12500000n. Returns 0n for anything that is not a plain decimal with up to 6 places. */
export function parse(value: string): bigint {
  if (!/^\d{1,30}(\.\d{1,6})?$/.test(value)) return 0n;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
}

/** A short, human reason an amount cannot be used, or "" when it is fine (or empty). */
export function amountProblem(text: string, max: bigint | undefined, maxLabel: string): string {
  if (text === "") return "";
  const amount = parse(text);
  if (amount === 0n) return /^0*(\.0*)?$/.test(text) ? "Enter an amount above 0." : "Use numbers only, with up to 6 decimals.";
  if (max !== undefined && amount > max) return `That is more than your ${maxLabel} (${format(max)}).`;
  return "";
}
