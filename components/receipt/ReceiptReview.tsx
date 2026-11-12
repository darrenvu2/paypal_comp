import type { RefObject } from "react";
import { dollars, fmt, parseCents } from "@/lib/money";
import type { Item } from "@/lib/totals";
import { Button, Card, Chip, Label, Row, Screen, inputCls } from "../ui";

type StartMode = "choice" | "camera" | "manual";

function MoneyInput({ cents, onCommit, label }: { cents: number; onCommit: (c: number) => void; label: string }) {
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      className={`${inputCls} w-20 text-right`}
      defaultValue={dollars(cents)}
      onBlur={(event) => {
        const parsed = parseCents(event.currentTarget.value);
        if (parsed === null) event.currentTarget.value = dollars(cents);
        else {
          onCommit(parsed);
          event.currentTarget.value = dollars(parsed);
        }
      }}
    />
  );
}

type ReceiptReviewProps = {
  startMode: StartMode;
  receiptImageUrl: string | null;
  manualTotalOnly: boolean;
  manualTotalCents: number;
  items: Item[];
  taxCents: number;
  tipCents: number;
  subtotal: number;
  total: number;
  taxPercentage: string;
  receiptTotalCents: number;
  parsing: boolean;
  parseError: string | null;
  cameraError: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  onStartCamera: () => void;
  onStartManual: () => void;
  onCapture: () => void;
  onUpload: (file: File | undefined) => void;
  onRetake: () => void;
  onManualTotalToggle: () => void;
  onManualTotalCommit: (cents: number) => void;
  onItemNameChange: (id: string, name: string) => void;
  onItemPriceChange: (id: string, cents: number) => void;
  onRemoveItem: (id: string) => void;
  onTaxChange: (cents: number) => void;
  onTipChange: (cents: number) => void;
  onAddItem: () => void;
  onContinue: () => void;
};

export function ReceiptReview({
  startMode,
  receiptImageUrl,
  manualTotalOnly,
  manualTotalCents,
  items,
  taxCents,
  tipCents,
  subtotal,
  total,
  taxPercentage,
  receiptTotalCents,
  parsing,
  parseError,
  cameraError,
  videoRef,
  onStartCamera,
  onStartManual,
  onCapture,
  onUpload,
  onRetake,
  onManualTotalToggle,
  onManualTotalCommit,
  onItemNameChange,
  onItemPriceChange,
  onRemoveItem,
  onTaxChange,
  onTipChange,
  onAddItem,
  onContinue,
}: ReceiptReviewProps) {
  const manualTotalSwitch = (
    <button
      type="button"
      aria-label="Enter total only"
      aria-pressed={manualTotalOnly}
      onClick={onManualTotalToggle}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${manualTotalOnly ? "bg-[#0B3FA8]" : "bg-slate-300"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${manualTotalOnly ? "left-6" : "left-1"}`} />
    </button>
  );

  return (
    <Screen
      step={1}
      title="Start splitting"
      footer={
        startMode === "manual" || receiptImageUrl ? (
          <>
            <Button onClick={onContinue} disabled={items.length === 0}>
              Looks right
            </Button>
            {(receiptImageUrl || (startMode === "manual" && !manualTotalOnly)) && (
              <Button secondary onClick={onAddItem}>
                Add item
              </Button>
            )}
          </>
        ) : null
      }
    >
      {startMode === "choice" && (
        <Card>
          <Label>CHOOSE HOW TO START</Label>
          <div className="flex flex-col gap-3 py-4">
            <button type="button" onClick={onStartCamera} className="rounded-xl bg-[#0B3FA8] px-4 py-4 text-base font-semibold text-white">
              Scan receipt
            </button>
            <button type="button" onClick={onStartManual} className="rounded-xl border border-[#0B3FA8] px-4 py-4 text-base font-semibold text-[#0B3FA8]">
              No receipt — enter manually
            </button>
          </div>
        </Card>
      )}

      {(startMode === "camera" || receiptImageUrl) && (
        <Card>
          <Label>START HERE</Label>
          {receiptImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={receiptImageUrl} alt="Receipt preview" className="mt-2 max-h-64 w-full rounded-xl object-contain" />
          ) : cameraError ? (
            <p className="m-0 mt-2 text-sm text-slate-600">{cameraError}</p>
          ) : (
            <video ref={videoRef} autoPlay muted playsInline className="mt-2 aspect-[4/3] w-full rounded-xl bg-slate-900 object-cover" />
          )}
          {parsing && <p className="m-0 mt-2 text-sm text-slate-600">Gemini is reading your receipt…</p>}
          {parseError && <p className="m-0 mt-2 text-sm text-red-700">{parseError}</p>}
          <div className="mt-3 flex gap-2">
            {receiptImageUrl ? (
              <button type="button" onClick={onRetake} className="flex-1 rounded-xl border border-[#0B3FA8] px-3 py-3 text-sm font-semibold text-[#0B3FA8]">
                Retake photo
              </button>
            ) : (
              <button type="button" onClick={onCapture} disabled={!!cameraError} className="flex-1 rounded-xl bg-[#0B3FA8] px-3 py-3 text-sm font-semibold text-white disabled:opacity-50">
                Capture receipt
              </button>
            )}
            <label htmlFor="receipt-image" className="cursor-pointer rounded-xl border border-slate-300 px-3 py-3 text-sm font-semibold text-slate-700">
              Upload
            </label>
          </div>
          <input id="receipt-image" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => onUpload(event.target.files?.[0])} />
        </Card>
      )}

      {startMode === "manual" && !receiptImageUrl && manualTotalOnly ? (
        <Card>
          <Label>ENTER TOTAL</Label>
          <div className="flex items-center justify-between py-4">
            <span className="text-[15px]">Bill total</span>
            <MoneyInput label="Bill total" cents={manualTotalCents} onCommit={onManualTotalCommit} />
            {manualTotalSwitch}
          </div>
        </Card>
      ) : (startMode === "manual" && !receiptImageUrl && !manualTotalOnly) || receiptImageUrl ? (
        <>
          <Card>
            {items.length === 0 && <p className="py-4 text-sm text-slate-600">No items yet. Scan a receipt or add an item below.</p>}
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 border-b border-slate-200 py-2.5 last:border-b-0">
                <input aria-label="Item name" className={`${inputCls} flex-1`} value={item.name} onChange={(event) => onItemNameChange(item.id, event.target.value)} />
                <span className="text-slate-600">$</span>
                <MoneyInput label={`${item.name} price`} cents={item.priceCents} onCommit={(cents) => onItemPriceChange(item.id, cents)} />
                <button type="button" aria-label={`Remove ${item.name}`} className="px-1 text-lg text-slate-500" onClick={() => onRemoveItem(item.id)}>
                  ×
                </button>
              </div>
            ))}
          </Card>
          <Card>
            <Row title="Subtotal" value={fmt(subtotal)} />
            <div className="flex items-center justify-between border-b border-slate-200 py-2.5">
              <span className="text-[15px]">Tax ({taxPercentage})</span>
              <MoneyInput label="Tax" cents={taxCents} onCommit={onTaxChange} />
            </div>
            <div className="flex items-center justify-between border-b border-slate-200 py-2.5">
              <span className="text-[15px]">Tip</span>
              <MoneyInput label="Tip" cents={tipCents} onCommit={onTipChange} />
            </div>
            {startMode === "manual" && !receiptImageUrl ? (
              <div className="flex items-center justify-between gap-3 py-2.5">
                <span className="font-semibold">Total</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600">Total only</span>
                  {manualTotalSwitch}
                  <span className="font-semibold">{fmt(total)}</span>
                </div>
              </div>
            ) : (
              <Row title="Total" value={fmt(total)} bold />
            )}
          </Card>
          <div>
            {receiptImageUrl && items.length > 0 && total === receiptTotalCents ? (
              <Chip tone="green">Items + tax + tip match receipt total</Chip>
            ) : items.length === 0 ? (
              <Chip tone="blue">Add items to get started</Chip>
            ) : receiptImageUrl ? (
              <Chip tone="amber">Doesn’t match receipt total of {fmt(receiptTotalCents)}</Chip>
            ) : null}
          </div>
        </>
      ) : null}
    </Screen>
  );
}
