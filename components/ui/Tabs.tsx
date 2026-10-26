"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// useLayoutEffect بيطلع تحذير على السيرفر، فبنستخدمه على المتصفح بس
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type TabItem<T extends string> = { value: T; label: React.ReactNode; count?: number; icon?: React.ReactNode };

// بيقيس مكان العنصر المختار علشان المؤشر يتحرك له بنعومة
function useIndicator<T extends string>(value: T, deps: unknown[]) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  const measure = () => {
    const el = itemRefs.current.get(value);
    if (!el) { setBox(null); return; }
    setBox({ left: el.offsetLeft, width: el.offsetWidth });
  };

  useIsoLayoutEffect(measure, [value, ...deps]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    itemRefs.current.forEach(el => ro.observe(el));
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ...deps]);

  const setItemRef = (key: string) => (el: HTMLButtonElement | null) => {
    if (el) itemRefs.current.set(key, el); else itemRefs.current.delete(key);
  };
  return { listRef, setItemRef, box };
}

/* ── تبويبات بخط تحتها (للتنقل بين أقسام الصفحة) ── */
export function Tabs<T extends string>({
  value, onChange, items, className, ariaLabel,
}: {
  value: T; onChange: (v: T) => void; items: TabItem<T>[]; className?: string; ariaLabel?: string;
}) {
  const { listRef, setItemRef, box } = useIndicator(value, [items.length]);
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn("relative -mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
    >
      {items.map(it => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            ref={setItemRef(it.value)}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 pb-2.5 pt-1.5 text-[13px] transition-colors duration-150",
              active ? "font-semibold text-text" : "text-subtext hover:text-text",
            )}
          >
            {it.icon}
            {it.label}
            {it.count !== undefined && (
              <span className={cn(
                "min-w-[1.25rem] rounded-full px-1.5 text-center text-[11px] font-semibold leading-[18px] tabular-nums",
                active ? "bg-accent/15 text-accent" : "bg-card3 text-subtext",
              )}>
                {it.count}
              </span>
            )}
          </button>
        );
      })}
      {box && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-accent transition-[transform,width] duration-300 ease-out"
          style={{ width: box.width, transform: `translateX(${box.left}px)` }}
        />
      )}
    </div>
  );
}

/* ── اختيار بين وضعين أو أكتر (عرض البنود / الأوامر مثلاً) ── */
export function Segmented<T extends string>({
  value, onChange, items, className, ariaLabel, size = "sm",
}: {
  value: T; onChange: (v: T) => void; items: TabItem<T>[]; className?: string; ariaLabel?: string; size?: "sm" | "md";
}) {
  const { listRef, setItemRef, box } = useIndicator(value, [items.length]);
  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("relative inline-flex shrink-0 items-center rounded-lg border border-border bg-card2/70 p-0.5", className)}
    >
      {box && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0.5 left-0 rounded-md border border-border-strong/70 bg-card3 shadow-card transition-[transform,width] duration-300 ease-out"
          style={{ width: box.width, transform: `translateX(${box.left}px)` }}
        />
      )}
      {items.map(it => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            ref={setItemRef(it.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "relative z-[1] inline-flex items-center gap-1.5 whitespace-nowrap rounded-md transition-colors duration-150",
              size === "sm" ? "px-3 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
              active ? "font-semibold text-text" : "text-subtext hover:text-text",
            )}
          >
            {it.icon}
            {it.label}
            {it.count !== undefined && <span className="tabular-nums opacity-70">{it.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
