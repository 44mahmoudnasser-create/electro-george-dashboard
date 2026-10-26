import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONE_TEXT } from "@/lib/status";

type StatTone = keyof typeof TONE_TEXT;

// كارت مؤشر: عنوان صغير فوق، الرقم تحته، وسطر توضيح اختياري.
// لو فيه onClick بيبقى زرار (فلتر مثلاً) ومعاه active للحالة المختارة.
export function StatCard({
  label, value, tone = "default", sub, icon: Icon, onClick, active, hint, className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: StatTone;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  onClick?: () => void;
  active?: boolean;
  hint?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs leading-5 text-subtext">{label}</span>
        {Icon && <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "default" ? "text-muted" : TONE_TEXT[tone])} />}
      </div>
      <div className={cn("mt-1 text-2xl font-bold leading-8 tabular-nums tracking-tight", TONE_TEXT[tone])}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] leading-5 text-subtext">{sub}</div>}
    </>
  );
  const cls = cn(
    "eg-card !p-4 block w-full text-start",
    onClick && "cursor-pointer transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px hover:border-border-strong hover:bg-card2/40 active:translate-y-0",
    active && "!border-accent/50 bg-accent/[0.04] ring-1 ring-accent/30",
    className,
  );
  if (onClick) {
    return <button type="button" onClick={onClick} title={hint} aria-pressed={active} className={cls}>{body}</button>;
  }
  return <div title={hint} className={cls}>{body}</div>;
}

// مؤشر صغير على سطر واحد (لملخصات اليوم مثلاً)
export function StatPill({ label, value, tone = "default", icon: Icon, className }: {
  label?: React.ReactNode; value: React.ReactNode; tone?: StatTone; icon?: LucideIcon; className?: string;
}) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border/70 bg-card2/60 px-2.5 py-1 text-xs",
      className,
    )}>
      {Icon && <Icon className={cn("size-3.5", TONE_TEXT[tone])} />}
      {label && <span className="text-subtext">{label}</span>}
      <span className={cn("font-bold tabular-nums", TONE_TEXT[tone])}>{value}</span>
    </span>
  );
}

// شريط تقدم بسيط (بيكبر بحركة أول ما يظهر)
export function ProgressBar({ value, tone = "accent", className, label }: {
  value: number; tone?: "accent" | "success" | "warning" | "danger"; className?: string; label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const bar = { accent: "bg-accent", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  return (
    <div
      role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-card3", className)}
    >
      <div className={cn("eg-grow h-full rounded-full transition-[width] duration-500 ease-out", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}
