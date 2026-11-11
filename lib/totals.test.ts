import { describe, expect, it } from "vitest";
import { allocate, computeTotals } from "./totals";

const items = [
  { id: "1", name: "Burger", priceCents: 1650 },
  { id: "2", name: "Fries", priceCents: 600 },
  { id: "3", name: "Nachos", priceCents: 1400 },
  { id: "4", name: "Pitcher", priceCents: 2200 },
  { id: "5", name: "Salad", priceCents: 1350 },
];
const assignments = [
  { itemId: "1", people: ["Sam"] },
  { itemId: "2", people: ["Sam"] },
  { itemId: "3", people: ["Alex", "You"] },
  { itemId: "4", people: ["Sam", "Alex", "You"] },
  { itemId: "5", people: ["You"] },
];

describe("allocate", () => {
  it("always sums exactly to the amount", () => {
    expect(allocate(2200, [1, 1, 1])).toEqual([734, 733, 733]);
    expect(allocate(1, [1, 1, 1])).toEqual([1, 0, 0]);
  });
  it("throws when there is nothing to weight by", () => {
    expect(() => allocate(100, [0, 0])).toThrow();
  });
});

describe("computeTotals (mockup example)", () => {
  const totals = computeTotals({ items, assignments, taxCents: 630, tipCents: 1440 });
  const get = (name: string) => totals.find((t) => t.person === name)!;

  it("matches the totals shown in the mockup", () => {
    expect(get("Sam").totalCents).toBe(3842);
    expect(get("Alex").totalCents).toBe(1845);
    expect(get("You").totalCents).toBe(3583);
  });
  it("adds up to the receipt total of $92.70", () => {
    expect(totals.reduce((s, t) => s + t.totalCents, 0)).toBe(9270);
  });
  it("gives invoice lines that sum to each person's items", () => {
    expect(get("Sam").lines.reduce((s, l) => s + l.cents, 0)).toBe(get("Sam").itemsCents);
  });
});

describe("computeTotals validation", () => {
  it("rejects unassigned items", () => {
    expect(() =>
      computeTotals({ items, assignments: assignments.slice(1), taxCents: 0, tipCents: 0 }),
    ).toThrow(/not assigned/);
  });
  it("stays exact on random splits", () => {
    for (let n = 0; n < 200; n++) {
      const people = ["A", "B", "C", "D"].slice(0, 1 + (n % 4));
      const rand = Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        name: `Item ${i}`,
        priceCents: 100 + ((n * 37 + i * 91) % 4000),
      }));
      const asg = rand.map((it, i) => ({ itemId: it.id, people: people.slice(0, 1 + ((n + i) % people.length)) }));
      const tax = (n * 53) % 900;
      const tip = (n * 71) % 2000;
      const result = computeTotals({ items: rand, assignments: asg, taxCents: tax, tipCents: tip });
      const expected = rand.reduce((s, i) => s + i.priceCents, 0) + tax + tip;
      expect(result.reduce((s, t) => s + t.totalCents, 0)).toBe(expected);
    }
  });
});
