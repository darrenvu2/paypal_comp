import type { ReactNode } from "react";

export function Screen({
  step,
  title,
  children,
  footer,
}: {
  step: number;
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col gap-4 bg-[#F6F7F9] px-5 pb-6 pt-10 text-[#0F172A] sm:my-6 sm:min-h-[844px] sm:rounded-[28px] sm:shadow-lg">
      <div className="text-xs font-semibold text-slate-600">STEP {step} OF 5</div>
      <h1 className="m-0 text-[28px] font-bold">{title}</h1>
      <div className="flex flex-1 flex-col gap-3">{children}</div>
      <div className="flex flex-col gap-2.5">{footer}</div>
    </main>
  );
}

export const Card = ({ children }: { children: ReactNode }) => (
  <div className="rounded-2xl bg-white px-4 py-1">{children}</div>
);

export const Label = ({ children }: { children: ReactNode }) => (
  <div className="pt-3 text-xs font-semibold text-slate-600">{children}</div>
);

export function Row({
  title,
  value,
  sub,
  bold,
}: {
  title: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="flex items-start justify-between border-b border-slate-200 py-3 last:border-b-0">
      <div>
        <div className={`text-[15px] ${bold ? "font-semibold" : ""}`}>{title}</div>
        {sub && <div className="mt-0.5 text-xs text-slate-600">{sub}</div>}
      </div>
      <div className={`text-[15px] ${bold ? "font-semibold" : ""}`}>{value}</div>
    </div>
  );
}

const TONES = {
  blue: "bg-[#E0ECFF] text-[#0B3FA8]",
  green: "bg-green-100 text-green-900",
  amber: "bg-amber-100 text-amber-900",
  solid: "bg-[#0B3FA8] text-white",
} as const;

export function Chip({
  children,
  tone = "blue",
  onClick,
  pressed,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  onClick?: () => void;
  pressed?: boolean;
}) {
  const cls = `inline-block rounded-full px-3 py-1 text-xs font-semibold ${TONES[tone]}`;
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={`${cls} cursor-pointer`}>
      {children}
    </button>
  ) : (
    <span className={cls}>{children}</span>
  );
}

export function Button({
  children,
  onClick,
  secondary,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-[52px] w-full rounded-xl text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
        secondary ? "border border-[#0B3FA8] bg-white text-[#0B3FA8]" : "bg-[#0B3FA8] text-white"
      }`}
    >
      {children}
    </button>
  );
}

export const inputCls =
  "min-w-0 rounded-md bg-transparent px-1 py-0.5 text-[15px] outline-none focus:ring-2 focus:ring-[#0B3FA8]";
