"use client";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// زرار فلتر بيتفعّل ويتلغي، مع عدّاد اختياري
export function FilterChip({
  active, onClick, children, count, tone, className, title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  /** warning: العداد بيتلوّن لو أكبر من صفر (للمتأخر مثلاً) */
  tone?: "warning" | "danger";
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn("eg-chip", active && "eg-chip-active", className)}
    >
      {children}
      {count !== undefined && (
        <span className={cn(
          "tabular-nums text-[11px]",
          tone && count > 0 ? (tone === "danger" ? "font-semibold text-danger" : "font-semibold text-warning") : "opacity-70",
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

// صف فلاتر قابل للتمرير أفقياً على الشاشات الصغيرة
export function ChipRow({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 md:mx-0 md:flex-wrap md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {children}
    </div>
  );
}

// حقل بحث بأيقونة وزرار مسح
export function SearchInput({
  value, onChange, placeholder = "بحث", className, inputClassName, autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        className={cn("eg-input eg-input-sm pr-8", value && "pl-7", inputClassName)}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="مسح البحث"
          className="absolute left-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted transition-colors hover:bg-card3 hover:text-text"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
