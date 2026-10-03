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

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Mission clock: seconds to "T+HH:MM:SS". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `T+${pad2(Math.floor(s / 3600))}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`;
}

/** Countdown: seconds to "MM:SS", or "H:MM:SS" past an hour. Rounds up so 0.2 s shows 00:01. */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const mm = pad2(Math.floor(s / 60) % 60);
  return h > 0 ? `${h}:${mm}:${pad2(s % 60)}` : `${mm}:${pad2(s % 60)}`;
}
