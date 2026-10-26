"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   إشعارات سريعة (toasts) بدل alert() والرسائل اللي جوه الصفحة
   الاستخدام:  const toast = useToast();  toast.success("تم الحفظ");  toast.error(err.message);
   ═══════════════════════════════════════════════════════════════ */

type Kind = "success" | "error" | "info" | "warning";
type Item = { id: number; kind: Kind; message: string; leaving: boolean };
type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  /** success لو ok = true، وإلا error — بديل مباشر لـ flash(ok, text) القديمة */
  show: (ok: boolean, message: string) => void;
};

const KIND = {
  success: { icon: CheckCircle2, cls: "text-success", bar: "bg-success" },
  error: { icon: XCircle, cls: "text-danger", bar: "bg-danger" },
  info: { icon: Info, cls: "text-accent", bar: "bg-accent" },
  warning: { icon: AlertTriangle, cls: "text-warning", bar: "bg-warning" },
} as const;

const DURATION: Record<Kind, number> = { success: 3200, info: 3600, warning: 5000, error: 6000 };
const MAX_VISIBLE = 4;

const noop = () => {};
const ToastContext = createContext<ToastApi>({ success: noop, error: noop, info: noop, warning: noop, show: noop });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => { setPortal(document.body); }, []);

  const remove = useCallback((id: number) => {
    setItems(prev => prev.map(t => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 170);
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const schedule = useCallback((id: number, ms: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.set(id, setTimeout(() => remove(id), ms));
  }, [remove]);

  const push = useCallback((kind: Kind, message: string) => {
    if (!message) return;
    const id = ++seq.current;
    setItems(prev => {
      // نفس الرسالة متكررة؟ نكتفي بواحدة
      const rest = prev.filter(t => !(t.message === message && t.kind === kind && !t.leaving));
      return [...rest, { id, kind, message, leaving: false }].slice(-MAX_VISIBLE);
    });
    schedule(id, DURATION[kind]);
  }, [schedule]);

  const api = useMemo<ToastApi>(() => ({
    success: m => push("success", m),
    error: m => push("error", m),
    info: m => push("info", m),
    warning: m => push("warning", m),
    show: (ok, m) => push(ok ? "success" : "error", m),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {portal && createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex flex-col items-center gap-2 p-3 sm:bottom-2 sm:left-2 sm:right-auto sm:items-start sm:p-4"
        >
          {items.map(t => {
            const k = KIND[t.kind];
            const Icon = k.icon;
            return (
              <div
                key={t.id}
                role={t.kind === "error" ? "alert" : "status"}
                onMouseEnter={() => { const timer = timers.current.get(t.id); if (timer) clearTimeout(timer); }}
                onMouseLeave={() => !t.leaving && schedule(t.id, 1800)}
                className={cn(
                  "pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border border-border/80 bg-card/95 py-3 pl-3 pr-3.5 text-sm shadow-pop backdrop-blur-xl",
                  t.leaving ? "animate-toast-out" : "animate-toast-in",
                )}
              >
                <span aria-hidden className={cn("absolute inset-y-0 right-0 w-0.5", k.bar)} />
                <Icon className={cn("mt-0.5 size-[18px] shrink-0", k.cls)} />
                <p className="min-w-0 flex-1 break-words leading-6 text-text">{t.message}</p>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  aria-label="إخفاء الإشعار"
                  className="eg-icon-btn -my-0.5 size-6"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>,
        portal,
      )}
    </ToastContext.Provider>
  );
}
