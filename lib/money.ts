export const dollars = (cents: number) => (cents / 100).toFixed(2);
export const fmt = (cents: number) => `$${dollars(cents)}`;

/** Parse "12", "12.5", "$1,200.00" into integer cents. Returns null if invalid. */
export function parseCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d*\.?\d{0,2}$/.test(cleaned) || cleaned === "" || cleaned === ".") return null;
  return Math.round(Number(cleaned) * 100);
}
