// Display formatting. The sim works in SI units; these convert for display only.

const group = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Distance in meters to a compact uppercase label: "850 M", "12.5 KM", "1,000 KM". */
export function formatDistance(m: number): string {
  const a = Math.abs(m);
  if (a < 1000) return `${group(m)} M`;
  const km = m / 1000;
  if (Math.abs(km) < 100) return `${group(km, Number.isInteger(km) ? 0 : 1)} KM`;
  return `${group(km)} KM`;
}
