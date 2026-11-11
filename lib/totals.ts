/**
 * Split math. Pure functions, integer cents only, no AI and no PayPal.
 * Every leftover cent is handed out by the largest-remainder method,
 * so per-person totals always add up exactly to the receipt total.
 */

export type Item = { id: string; name: string; priceCents: number };
export type Assignment = { itemId: string; people: string[] };
export type SplitInput = {
  items: Item[];
  assignments: Assignment[];
  taxCents: number;
  tipCents: number;
};
export type PersonLine = { name: string; cents: number };
export type PersonTotal = {
  person: string;
  itemsCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
  lines: PersonLine[];
};

/** Split `amount` across `weights` proportionally. Result sums exactly to `amount`. */
export function allocate(amount: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new Error("Cannot allocate: total weight is zero");
  const parts = weights.map((w, index) => {
    const numerator = amount * w;
    return { index, base: Math.floor(numerator / totalWeight), frac: numerator % totalWeight };
  });
  let leftover = amount - parts.reduce((sum, p) => sum + p.base, 0);
  // Biggest fractional remainder gets the next cent; ties go to the earlier person.
  const order = [...parts].sort((a, b) => b.frac - a.frac || a.index - b.index);
  const result = parts.map((p) => p.base);
  for (const p of order) {
    if (leftover <= 0) break;
    result[p.index] += 1;
    leftover -= 1;
  }
  return result;
}

export function computeTotals(input: SplitInput): PersonTotal[] {
  const { items, assignments, taxCents, tipCents } = input;
  const byItem = new Map(assignments.map((a) => [a.itemId, a.people]));
  const people: string[] = [];
  const totals = new Map<string, PersonTotal>();

  for (const item of items) {
    const who = byItem.get(item.id);
    if (!who || who.length === 0) throw new Error(`Item "${item.name}" is not assigned to anyone`);
    if (new Set(who).size !== who.length) throw new Error(`Item "${item.name}" lists a person twice`);
    const shares = allocate(item.priceCents, who.map(() => 1));
    who.forEach((person, i) => {
      if (!totals.has(person)) {
        people.push(person);
        totals.set(person, { person, itemsCents: 0, taxCents: 0, tipCents: 0, totalCents: 0, lines: [] });
      }
      const t = totals.get(person)!;
      t.itemsCents += shares[i];
      t.lines.push({ name: who.length > 1 ? `${item.name} (shared, 1/${who.length})` : item.name, cents: shares[i] });
    });
  }

  const weights = people.map((p) => totals.get(p)!.itemsCents);
  const taxShares = allocate(taxCents, weights);
  const tipShares = allocate(tipCents, weights);
  people.forEach((p, i) => {
    const t = totals.get(p)!;
    t.taxCents = taxShares[i];
    t.tipCents = tipShares[i];
    t.totalCents = t.itemsCents + t.taxCents + t.tipCents;
  });

  const result = people.map((p) => totals.get(p)!);
  const expected = items.reduce((s, i) => s + i.priceCents, 0) + taxCents + tipCents;
  const actual = result.reduce((s, t) => s + t.totalCents, 0);
  if (actual !== expected) throw new Error(`Totals ${actual} do not match receipt ${expected}`);
  return result;
}
