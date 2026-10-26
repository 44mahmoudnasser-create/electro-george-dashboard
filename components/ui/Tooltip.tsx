"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

// تلميح صغير بيظهر عند المرور أو التركيز بالكيبورد.
// بيترسم في body علشان مايتقصش جوه الجداول أو القوائم اللي ليها scroll.
export default function Tooltip({
  content, side = "top", children, className, delay = 250,
}: {
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const place = () => {
    const el = ref.current?.firstElementChild ?? ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    if (side === "top") setPos({ x: r.left + r.width / 2, y: r.top - gap });
    else if (side === "bottom") setPos({ x: r.left + r.width / 2, y: r.bottom + gap });
    else if (side === "left") setPos({ x: r.left - gap, y: r.top + r.height / 2 });
    else setPos({ x: r.right + gap, y: r.top + r.height / 2 });
  };

  const show = (immediate = false) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(place, immediate ? 0 : delay);
  };
  const hide = () => { clearTimeout(timer.current); setPos(null); };

  useEffect(() => {
    if (!pos) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [pos]);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!content) return <>{children}</>;

  const transform =
    side === "top" ? "translate(-50%, -100%)" :
    side === "bottom" ? "translate(-50%, 0)" :
    side === "left" ? "translate(-100%, -50%)" : "translate(0, -50%)";

  return (
    <>
      <span
        ref={ref}
        className={cn("inline-flex", className)}
        onMouseEnter={() => show()}
        onMouseLeave={hide}
        onFocus={() => show(true)}
        onBlur={hide}
        onPointerDown={hide}
      >
        {children}
      </span>
      {pos && createPortal(
        <div
          role="tooltip"
          style={{ left: pos.x, top: pos.y, transform }}
          className="pointer-events-none fixed z-[200] w-max"
        >
          <div className="max-w-[16rem] animate-pop-in rounded-md border border-border-strong/70 bg-card3 px-2 py-1 text-[11px] font-medium leading-5 text-text shadow-pop">
            {content}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
