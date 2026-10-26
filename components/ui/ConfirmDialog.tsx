"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import Modal from "./Modal";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   نافذة تأكيد بدل confirm() بتاعة المتصفح
   الاستخدام:
     const confirm = useConfirm();
     if (!(await confirm({ title: "حذف البند؟", tone: "danger", confirmText: "حذف" }))) return;
   ═══════════════════════════════════════════════════════════════ */

export type ConfirmOptions = {
  title: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** danger: لون أحمر وزرار الإلغاء عليه التركيز · primary: تأكيد عادي */
  tone?: "danger" | "primary";
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(
  async opts => (typeof window !== "undefined" ? window.confirm(opts.title) : false),
);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<Pending | null>(null);

  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>(resolve => {
    // لو فيه تأكيد قديم لسه مفتوح نعتبره اتلغى
    pendingRef.current?.resolve(false);
    const next = { ...opts, resolve };
    pendingRef.current = next;
    setPending(next);
    setOpen(true);
  }), []);

  const finish = (ok: boolean) => {
    pendingRef.current?.resolve(ok);
    pendingRef.current = null;
    setOpen(false);
  };

  const danger = (pending?.tone ?? "danger") === "danger";
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={open} onClose={() => finish(false)} title={pending?.title ?? ""} size="sm">
        {pending && (
          <div className="space-y-5">
            <div className="flex items-start gap-3">
              <span className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full",
                danger ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent",
              )}>
                <Icon className="size-5" />
              </span>
              <div className="pt-1 text-sm leading-6 text-subtext">
                {pending.message ?? (danger ? "الإجراء ده مش هينفع يترجع." : "متأكد إنك عايز تكمل؟")}
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => finish(false)}
                data-autofocus={danger ? "" : undefined}
                className="eg-btn-ghost w-full sm:w-auto"
              >
                {pending.cancelText ?? "إلغاء"}
              </button>
              <button
                type="button"
                onClick={() => finish(true)}
                data-autofocus={danger ? undefined : ""}
                className={cn(danger ? "eg-btn-danger" : "eg-btn-primary", "w-full sm:w-auto")}
              >
                {pending.confirmText ?? (danger ? "حذف" : "تأكيد")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}
