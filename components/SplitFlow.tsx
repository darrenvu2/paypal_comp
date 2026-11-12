"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeTotals, type Item } from "@/lib/totals";
import { fmt } from "@/lib/money";
import { Button, Card, Chip, Row, Screen } from "./ui";
import { ReceiptReview } from "./receipt/ReceiptReview";
import { PeopleAssignment, type Person } from "./people/PeopleAssignment";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SplitFlow() {
  const [step, setStep] = useState(1);
  const [startMode, setStartMode] = useState<"choice" | "camera" | "manual">("choice");
  const [manualTotalOnly, setManualTotalOnly] = useState(false);
  const [manualTotalCents, setManualTotalCents] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const [receiptTotalCents, setReceiptTotalCents] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [taxCents, setTax] = useState(0);
  const [tipCents, setTip] = useState(0);
  const [people, setPeople] = useState<Person[]>([
    { name: "Me", email: "", isPayer: true },
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
  const namedPeople = names.filter(Boolean);
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

  const parseReceipt = async (file: File) => {
    setParsing(true);
    setParseError(null);
    try {
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("Could not read the receipt image."));
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/receipt/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ imageBase64, mediaType: file.type }),
      });
      const body = (await response.json()) as {
        error?: string;
        items?: Item[];
        taxCents?: number;
        tipCents?: number;
        totalCents?: number;
      };
      if (!response.ok) throw new Error(body.error ?? "Claude could not read the receipt.");
      setItems((body.items ?? []).map((item, index) => ({ ...item, id: String(index + 1) })));
      setTax(body.taxCents ?? 0);
      setTip(body.tipCents ?? 0);
      setReceiptTotalCents(body.totalCents ?? 0);
    } catch (error) {
      setParseError(error instanceof Error && error.name === "TimeoutError" ? "Gemini took too long to respond. Check your API key and try again." : error instanceof Error ? error.message : "Gemini could not read the receipt.");
    } finally {
      setParsing(false);
    }
  };

  const handleReceiptImage = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    setStartMode("manual");
    setReceiptImageUrl(URL.createObjectURL(file));
    void parseReceipt(file);
  };

  useEffect(() => {
    if (step !== 1 || startMode !== "camera" || receiptImageUrl) return;
    let active = true;
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not available in this browser.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraError("Camera access was blocked. You can upload a receipt instead."));
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [step, startMode, receiptImageUrl]);

  const captureReceipt = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], "receipt.jpg", { type: "image/jpeg" });
        setStartMode("manual");
        setReceiptImageUrl(URL.createObjectURL(blob));
        void parseReceipt(file);
      }
    }, "image/jpeg", 0.92);
  };

  const retakeReceipt = () => {
    if (receiptImageUrl) URL.revokeObjectURL(receiptImageUrl);
    setStartMode("camera");
    setManualTotalOnly(false);
    setParseError(null);
    setReceiptImageUrl(null);
  };

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
    setStartMode("choice");
    setManualTotalOnly(false);
    setManualTotalCents(0);
    setReceiptImageUrl(null);
    setReceiptTotalCents(0);
    setParseError(null);
    setAssign({});
    setEqualSplit(false);
    setPaid({});
    setInvoiceLinks({});
    setNote("");
  };

  // ---------- Step 1: review ----------
  if (step === 1)
    return (
      <ReceiptReview
        startMode={startMode}
        receiptImageUrl={receiptImageUrl}
        manualTotalOnly={manualTotalOnly}
        manualTotalCents={manualTotalCents}
        items={items}
        taxCents={taxCents}
        tipCents={tipCents}
        subtotal={subtotal}
        total={total}
        taxPercentage={taxPercentage}
        receiptTotalCents={receiptTotalCents}
        parsing={parsing}
        parseError={parseError}
        cameraError={cameraError}
        videoRef={videoRef}
        onStartCamera={() => setStartMode("camera")}
        onStartManual={() => {
          setStartMode("manual");
          setManualTotalOnly(false);
          setManualTotalCents(0);
          setReceiptImageUrl(null);
          setItems([]);
          setTax(0);
          setTip(0);
          setReceiptTotalCents(0);
        }}
        onCapture={captureReceipt}
        onUpload={handleReceiptImage}
        onRetake={retakeReceipt}
        onManualTotalToggle={() => {
          if (manualTotalOnly) {
            setManualTotalOnly(false);
            setManualTotalCents(0);
            setItems([]);
            setTax(0);
            setTip(0);
          } else {
            const currentTotal = subtotal + taxCents + tipCents;
            setManualTotalOnly(true);
            setManualTotalCents(currentTotal);
            setItems([{ id: "manual-total", name: "Bill total", priceCents: currentTotal }]);
            setTax(0);
            setTip(0);
          }
        }}
        onManualTotalCommit={(cents) => {
          setManualTotalCents(cents);
          setItems([{ id: "manual-total", name: "Bill total", priceCents: cents }]);
        }}
        onItemNameChange={(id, name) => setItems((list) => list.map((item) => (item.id === id ? { ...item, name } : item)))}
        onItemPriceChange={(id, cents) => setItems((list) => list.map((item) => (item.id === id ? { ...item, priceCents: cents } : item)))}
        onRemoveItem={(id) => setItems((list) => list.filter((item) => item.id !== id))}
        onTaxChange={setTax}
        onTipChange={setTip}
        onAddItem={() => setItems((list) => [...list, { id: crypto.randomUUID(), name: "New item", priceCents: 0 }])}
        onContinue={() => setStep(2)}
      />
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
        <PeopleAssignment
          people={people}
          namedPeople={namedPeople}
          items={items}
          assign={assign}
          equalSplit={equalSplit}
          peopleError={peopleError}
          onToggleEqualSplit={() => {
            if (equalSplit) {
              setEqualSplit(false);
              setAssign({});
            } else {
              setEqualSplit(true);
              setAssign(Object.fromEntries(items.map((item) => [item.id, names.filter(Boolean)])));
            }
          }}
          onNameChange={(index, name) => setPeople((list) => list.map((person, personIndex) => (personIndex === index ? { ...person, name } : person)))}
          onEmailChange={(index, email) => setPeople((list) => list.map((person, personIndex) => (personIndex === index ? { ...person, email } : person)))}
          onRemovePerson={removePerson}
          onAddPerson={() => setPeople((list) => [...list, { name: "", email: "", isPayer: false }])}
          onToggleItem={toggle}
          assignedCount={assigned}
        />
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
