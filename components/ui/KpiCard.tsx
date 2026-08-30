"use client";

export default function KpiCard({
  label, value, color = "text-accent", onClick
}: {
  label: string; value: string|number; color?: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`eg-card flex flex-col items-center justify-center gap-1 min-w-[130px] transition-all
        ${onClick ? "cursor-pointer hover:border-accent/40 hover:bg-card2 active:scale-95" : "cursor-default"}`}
    >
      <span className={`text-3xl font-extrabold leading-none ${color}`}>{value}</span>
      <span className="text-xs text-subtext text-center leading-tight">{label}</span>
      {onClick && <span className="text-[10px] text-accent/60 mt-0.5">اضغط للتفاصيل</span>}
    </button>
  );
}
