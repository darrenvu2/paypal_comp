"use client";

import { useMemo, useState } from "react";
import { computeTotals, type Item } from "@/lib/totals";
import { dollars, fmt, parseCents } from "@/lib/money";
import { Button, Card, Chip, Label, Row, Screen, inputCls } from "./ui";

type Person = { name: string; email: string; isPayer: boolean };

// Sample data until receipt parsing (AI) is wired in.
const SAMPLE_ITEMS: Item[] = [
  { id: "1", name: "Burger", priceCents: 1650 },
  { id: "2", name: "Fries", priceCents: 600 },
  { id: "3", name: "Nachos", priceCents: 1400 },
  { id: "4", name: "Pitcher of beer", priceCents: 2200 },
  { id: "5", name: "Side salad", priceCents: 1350 },
];
const RECEIPT_TOTAL = 9270;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Text input that edits dollars and commits integer cents on blur. */
function MoneyInput({ cents, onCommit, label }: { cents: number; onCommit: (c: number) => void; label: string }) {
  const [text, setText] = useState(dollars(cents));
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      className={`${inputCls} w-20 text-right`}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const c = parseCents(text);
        if (c === null) setText(dollars(cents));
        else {
          onCommit(c);
          setText(dollars(c));
        }
      }}
    />
  );
}

export default function SplitFlow() {
  const [step, setStep] = useState(1);
  const [items, setItems] = useState<Item[]>(SAMPLE_ITEMS);
  const [taxCents, setTax] = useState(630);
  const [tipCents, setTip] = useState(1440);
  const [people, setPeople] = useState<Person[]>([
    { name: "You", email: "", isPayer: true },
    { name: "Sam", email: "", isPayer: false },
    { name: "Alex", email: "", isPayer: false },
  ]);
  const [assign, setAssign] = useState<Record<string, string[]>>({});
  const [equalSplit, setEqualSplit] = useState(false);
  const [selected, setSelected] = useState(0);
  const [paid, setPaid] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [invoiceLinks, setInvoiceLinks] = useState<Record<string, string>>({});

  const subtotal = items.reduce((s, i) => s + i.priceCents, 0);
  const total = subtotal + taxCents + tipCents;
  const taxPercentage = subtotal > 0 ? `${((taxCents / subtotal) * 100).toFixed(2)}%` : "—";
  const names = people.map((p) => p.name.trim());
  const peopleError = names.some((n) => !n)
    ? "Every person needs a name."
    : new Set(names).size !== names.length
      ? "Names must be different."
      : null;

  const result = useMemo(() => {
    try {
      const valid = new Set(names);
      const assignments = items.map((i) => ({
        itemId: i.id,
        people: (assign[i.id] ?? []).filter((n) => valid.has(n)),
      }));
      return { totals: computeTotals({ items, assignments, taxCents, tipCents, equalSplit }) };
    } catch (e) {
      return { error: (e as Error).message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, assign, taxCents, tipCents, people, equalSplit]);

  const payer = people.find((p) => p.isPayer)!;
  const owing = (result.totals ?? []).filter((t) => t.person !== payer.name.trim());

  const toggle = (itemId: string, name: string) =>
    setAssign((a) => {
      const cur = a[itemId] ?? [];
      return { ...a, [itemId]: cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name] };
    });
  const removePerson = (index: number) => {
    const remainingPeople = people.filter((_, i) => i !== index);
    const remainingNames = new Set(remainingPeople.map((p) => p.name.trim()));
    setPeople(remainingPeople);
    setAssign((current) =>
      Object.fromEntries(
        Object.entries(current).map(([itemId, assignedNames]) => [
          itemId,
          assignedNames.filter((name) => remainingNames.has(name)),
        ]),
      ),
    );
  };
  const emailFor = (name: string) => people.find((p) => p.name.trim() === name)?.email ?? "";
  const badEmail = owing.find((t) => !EMAIL.test(emailFor(t.person).trim()));

  const goInvoices = () => {
    if (badEmail) return setNote(`Add a valid email for ${badEmail.person} to preview invoices.`);
    setNote("");
    setSelected(0);
    setStep(4);
  };
  const sendInvoices = async () => {
    setSending(true);
    setNote("");
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoices: owing.map((t) => ({
            recipientName: t.person,
            recipientEmail: emailFor(t.person).trim(),
            totalCents: t.totalCents,
            lines: [
              ...t.lines,
              { name: "Tax (your share)", cents: t.taxCents },
              { name: "Tip (your share)", cents: t.tipCents },
            ],
          })),
        }),
      });
      const body = (await response.json()) as { error?: string; invoices?: { person: string; payerLink?: string }[] };
      if (!response.ok) throw new Error(body.error ?? "Unable to send invoices.");
      setInvoiceLinks(Object.fromEntries((body.invoices ?? []).filter((invoice) => invoice.payerLink).map((invoice) => [invoice.person, invoice.payerLink!])));
      setStep(5);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Unable to send invoices.");
    } finally {
      setSending(false);
    }
  };
  const restart = () => {
    setStep(1);
    setAssign({});
    setEqualSplit(false);
    setPaid({});
    setInvoiceLinks({});
    setNote("");
  };

  // ---------- Step 1: review ----------
  if (step === 1)
    return (
      <Screen
        step={1}
        title="Review items"
        footer={
          <>
            <Button onClick={() => setStep(2)} disabled={items.length === 0}>
              Looks right
            </Button>
            <Button secondary onClick={() => setItems((i) => [...i, { id: crypto.randomUUID(), name: "New item", priceCents: 0 }])}>
              Add item
            </Button>
          </>
        }
      >
        <Card>
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-2 border-b border-slate-200 py-2.5 last:border-b-0">
              <input
                aria-label="Item name"
                className={`${inputCls} flex-1`}
                value={it.name}
                onChange={(e) => setItems((l) => l.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))}
              />
              <span className="text-slate-600">$</span>
              <MoneyInput
                key={`${it.id}-${it.priceCents}`}
                label={`${it.name} price`}
                cents={it.priceCents}
                onCommit={(c) => setItems((l) => l.map((x) => (x.id === it.id ? { ...x, priceCents: c } : x)))}
              />
              <button
                type="button"
                aria-label={`Remove ${it.name}`}
                className="px-1 text-lg text-slate-500"
                onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))}
              >
                ×
              </button>
            </div>
          ))}
        </Card>
        <Card>
          <Row title="Subtotal" value={fmt(subtotal)} />
          <div className="flex items-center justify-between border-b border-slate-200 py-2.5">
            <span className="text-[15px]">Tax ({taxPercentage})</span>
            <MoneyInput key={`tax-${taxCents}`} label="Tax" cents={taxCents} onCommit={setTax} />
          </div>
          <div className="flex items-center justify-between border-b border-slate-200 py-2.5">
            <span className="text-[15px]">Tip</span>
            <MoneyInput key={`tip-${tipCents}`} label="Tip" cents={tipCents} onCommit={setTip} />
          </div>
          <Row title="Total" value={fmt(total)} bold />
        </Card>
        <div>
          {total === RECEIPT_TOTAL ? (
            <Chip tone="green">Items + tax + tip match receipt total</Chip>
          ) : (
            <Chip tone="amber">Doesn’t match receipt total of {fmt(RECEIPT_TOTAL)}</Chip>
          )}
        </div>
      </Screen>
    );

  // ---------- Step 2: assign ----------
  if (step === 2) {
    const assigned = items.filter((i) => (assign[i.id] ?? []).length > 0).length;
    const calcError = peopleError ?? (result.error && assigned === items.length ? result.error : null);
    return (
      <Screen
        step={2}
        title="Who had what?"
        footer={
          <>
            {calcError && <p className="m-0 text-sm text-red-700">{calcError}</p>}
            <Button onClick={() => setStep(3)} disabled={!!peopleError || !result.totals}>
              Calculate totals
            </Button>
            <Button secondary onClick={() => setStep(1)}>
              Back
            </Button>
          </>
        }
      >
        <div className="rounded-2xl bg-white p-4">
          <label htmlFor="ai" className="text-xs font-semibold text-slate-600">
            TELL SPLITPAY WHO ATE WHAT
          </label>
          <textarea
            id="ai"
            disabled
            rows={2}
            placeholder="AI assignment is coming next. For now, tap names below."
            className="mt-1.5 w-full resize-none bg-transparent text-[15px] outline-none"
          />
        </div>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <Label>PEOPLE</Label>
            <button
              type="button"
              role="switch"
              aria-checked={equalSplit}
              aria-label="Split equally"
              disabled={peopleError !== null || items.length === 0}
              className={`relative h-7 w-12 shrink-0 rounded-full p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                equalSplit ? "bg-[#2188E8]" : "bg-slate-300"
              }`}
              onClick={() => {
                if (equalSplit) {
                  setEqualSplit(false);
                  setAssign({});
                } else {
                  setEqualSplit(true);
                  setAssign(Object.fromEntries(items.map((item) => [item.id, names.filter(Boolean)])));
                }
              }}
            >
              <span
                aria-hidden="true"
                className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  equalSplit ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="mb-1 text-right text-xs text-slate-500">Split equally</div>
          {people.map((p, i) => (
            <div key={i} className="flex items-center gap-2 border-b border-slate-200 py-2 last:border-b-0">
              <input
                aria-label="Name"
                className={`${inputCls} w-24 font-semibold`}
                value={p.name}
                onChange={(e) => setPeople((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              {p.isPayer ? (
                <span className="text-sm text-slate-600">paid the bill</span>
              ) : (
                <>
                  <input
                    aria-label={`${p.name} email`}
                    type="email"
                    placeholder="PayPal email"
                    className={`${inputCls} flex-1 text-sm`}
                    value={p.email}
                    onChange={(e) => setPeople((l) => l.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${p.name || "person"}`}
                    className="shrink-0 px-1 text-lg text-slate-500"
                    onClick={() => removePerson(i)}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))}
          <div className="py-2">
            <button
              type="button"
              className="text-sm font-semibold text-[#0B3FA8]"
              onClick={() => setPeople((l) => [...l, { name: `Friend ${l.length}`, email: "", isPayer: false }])}
            >
              + Add person
            </button>
          </div>
        </Card>
        <Card>
          {items.map((it) => (
            <div key={it.id} className="border-b border-slate-200 py-3 last:border-b-0">
              <div className="mb-2 flex justify-between text-[15px]">
                <span>{it.name}</span>
                <span>{fmt(it.priceCents)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {names.map((n) => (
                  <Chip
                    key={n}
                    tone={(assign[it.id] ?? []).includes(n) ? "solid" : "blue"}
                    pressed={(assign[it.id] ?? []).includes(n)}
                    onClick={equalSplit ? undefined : () => toggle(it.id, n)}
                  >
                    {n || "?"}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </Card>
        <div>
          <Chip tone={assigned === items.length ? "green" : "blue"}>
            {assigned} of {items.length} items assigned
          </Chip>
        </div>
      </Screen>
    );
  }

  const totals = result.totals;
  if (!totals) {
    // Inputs changed under us (e.g. after restart); send the user back to assignment.
    return (
      <Screen step={2} title="Something changed" footer={<Button onClick={() => setStep(2)}>Back to assignment</Button>}>
        <p className="m-0 text-sm text-slate-600">{result.error}</p>
      </Screen>
    );
  }

  // ---------- Step 3: totals ----------
  if (step === 3)
    return (
      <Screen
        step={3}
        title="Each person’s share"
        footer={
          <>
            {note && <p className="m-0 text-sm text-red-700">{note}</p>}
            <Button onClick={goInvoices} disabled={owing.length === 0}>
              Preview invoices
            </Button>
            <Button secondary onClick={() => setStep(2)}>
              Back
            </Button>
          </>
        }
      >
        <Card>
          {totals.map((t) => (
            <Row
              key={t.person}
              title={t.person === payer.name.trim() ? `${t.person} (paid)` : t.person}
              value={fmt(t.totalCents)}
              sub={`Items ${fmt(t.itemsCents)} + tax and tip ${fmt(t.taxCents + t.tipCents)}`}
            />
          ))}
        </Card>
        <p className="m-0 text-[13px] leading-normal text-slate-600">
          Tax and tip are split in proportion to each person’s items. Totals add up to {fmt(total)}.
        </p>
      </Screen>
    );

  // ---------- Step 4: invoice preview ----------
  if (step === 4) {
    const t = owing[Math.min(selected, owing.length - 1)];
    return (
      <Screen
        step={4}
        title="Preview invoices"
        footer={
          <>
            <Button
              onClick={sendInvoices}
              disabled={sending}
            >
              {sending ? "Sending…" : `Send ${owing.length} invoice${owing.length === 1 ? "" : "s"}`}
            </Button>
            <Button secondary onClick={() => setStep(3)}>
              Back to totals
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {owing.map((o, i) => (
            <Chip key={o.person} tone={o.person === t.person ? "solid" : "blue"} onClick={() => setSelected(i)} pressed={o.person === t.person}>
              {o.person}
            </Chip>
          ))}
        </div>
        <div className="rounded-2xl bg-white px-4 py-3">
          <div className="text-xs font-semibold text-slate-600">INVOICE TO {emailFor(t.person).trim()}</div>
          <div className="mb-1.5 mt-1 text-[13px] text-slate-600">Dinner split – your share</div>
          {t.lines.map((l) => (
            <Row key={l.name} title={l.name} value={fmt(l.cents)} />
          ))}
          <Row title="Tax (your share)" value={fmt(t.taxCents)} />
          <Row title="Tip (your share)" value={fmt(t.tipCents)} />
          <Row title="Total due" value={fmt(t.totalCents)} bold />
        </div>
        <p className="m-0 text-[13px] leading-normal text-slate-600">
          Once sent, an invoice can’t be deleted, only cancelled. Check each one before sending.
        </p>
      </Screen>
    );
  }

  // ---------- Step 5: status ----------
  const owed = owing.reduce((s, t) => s + t.totalCents, 0);
  const collected = owing.filter((t) => paid[t.person]).reduce((s, t) => s + t.totalCents, 0);
  const nextPending = owing.find((t) => !paid[t.person]);
  return (
    <Screen
      step={5}
      title="Payment status"
      footer={
        <>
          <Button secondary disabled>
            Send reminder (coming soon)
          </Button>
          <Button secondary onClick={() => nextPending && setPaid((p) => ({ ...p, [nextPending.person]: true }))} disabled={!nextPending}>
            Record payment (demo)
          </Button>
          <button type="button" className="text-sm font-semibold text-[#0B3FA8]" onClick={restart}>
            Start over
          </button>
        </>
      }
    >
      <div className="rounded-2xl bg-white p-4">
        <div className="text-xs font-semibold text-slate-600">COLLECTED</div>
        <div className="text-[32px] font-bold">
          {fmt(collected)} <span className="text-[15px] font-normal text-slate-600">of {fmt(owed)}</span>
        </div>
        <div className="mt-2.5 h-2 rounded bg-slate-200">
          <div className="h-2 rounded bg-[#0B3FA8]" style={{ width: `${owed ? (collected / owed) * 100 : 0}%` }} />
        </div>
      </div>
      <Card>
        {owing.map((t) => (
          <div key={t.person}>
            <Row key={t.person} title={t.person} value={fmt(t.totalCents)} />
            {invoiceLinks[t.person] && (
              <a
                href={invoiceLinks[t.person]}
                target="_blank"
                rel="noreferrer"
                className="-mt-1 mb-2 block text-xs font-semibold text-[#0B3FA8]"
              >
                Open PayPal invoice
              </a>
            )}
          </div>
        ))}
      </Card>
      <div className="flex flex-wrap gap-2">
        {owing.map((t) => (
          <Chip key={t.person} tone={paid[t.person] ? "green" : "amber"}>
            {t.person}: {paid[t.person] ? "Paid" : "Invoice sent"}
          </Chip>
        ))}
      </div>
      <p className="m-0 text-[13px] leading-normal text-slate-600">
        Payments are recorded by hand for now; PayPal invoice links are live Sandbox links.
      </p>
    </Screen>
  );
}
