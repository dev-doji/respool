import { formatUnits, parseUnits } from "viem";

/** 1500000n with 6 decimals -> "1.5". Tiny non-zero amounts read "<0.0001" instead of a misleading "0". */
export function fmt(value: bigint, decimals: number, maxFraction = 4): string {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, "");
  const out = trimmed ? `${whole}.${trimmed}` : whole;
  return out === "0" && value > 0n ? `<${(10 ** -maxFraction).toFixed(maxFraction)}` : out;
}

/** "12.5" -> base units, or undefined for anything that is not a plain positive decimal. */
export function parseAmount(text: string, decimals: number): bigint | undefined {
  if (!new RegExp(`^\\d{1,30}(\\.\\d{1,${decimals}})?$`).test(text)) return undefined;
  const value = parseUnits(text, decimals);
  return value > 0n ? value : undefined;
}
