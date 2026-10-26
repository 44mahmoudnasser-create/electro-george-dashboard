"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   نافذة منبثقة موحدة لكل التطبيق
   • بتتفتح وتتقفل بحركة (على الموبايل بتطلع من تحت كـ bottom sheet)
   • Esc بيقفل النافذة اللي فوق بس (لو فيه تأكيد فوق نافذة تانية)
   • التركيز بيفضل جوه النافذة، وبيرجع للزرار اللي فتحها بعد القفل
   ═══════════════════════════════════════════════════════════════ */

const EXIT_MS = 180;
const WIDTHS = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" } as const;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// النوافذ المفتوحة بالترتيب — آخر واحدة هي اللي بتستقبل Esc و Tab
const stack: string[] = [];

type View = { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode };

export default function Modal({
  open, onClose, title, description, children, footer, size = "md", className,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof WIDTHS;
  className?: string;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  // بنحتفظ بآخر محتوى علشان النافذة ماتفضاش وهي بتتقفل (الأب غالباً بيمسح البيانات أول ما يقفل)
  const viewRef = useRef<View>({ title, description, children, footer });
  if (open) viewRef.current = { title, description, children, footer };
  const view = viewRef.current;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, EXIT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc + حصر التنقل بـ Tab جوه النافذة + إرجاع التركيز
  useEffect(() => {
    if (!open || !mounted) return;
    const previous = document.activeElement as HTMLElement | null;
    stack.push(id);

    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) {
      const auto = panel.querySelector<HTMLElement>("[autofocus],[data-autofocus]");
      (auto ?? panel).focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
          .filter(n => n.offsetParent !== null);
        if (nodes.length === 0) { e.preventDefault(); return; }
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      const i = stack.lastIndexOf(id);
      if (i >= 0) stack.splice(i, 1);
      if (stack.length === 0) document.body.style.overflow = overflow;
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open, mounted, id]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <div
        aria-hidden
        onClick={() => onCloseRef.current()}
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-[2px]",
          closing ? "animate-fade-out" : "animate-fade-in",
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-border/80 bg-card shadow-pop outline-none",
          "rounded-t-2xl sm:max-h-[88vh] sm:rounded-2xl",
          WIDTHS[size],
          closing ? "pointer-events-none animate-sheet-down sm:animate-scale-out" : "animate-sheet-up sm:animate-scale-in",
          className,
        )}
      >
        {/* مقبض السحب على الموبايل (شكلي) */}
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong sm:hidden" />
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-5 pb-3.5 pt-3 sm:pt-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold leading-7 text-text">{view.title}</h2>
            {view.description && <p className="mt-0.5 text-xs leading-5 text-subtext">{view.description}</p>}
          </div>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="إغلاق"
            className="eg-icon-btn -ml-1.5 mt-0.5 size-8"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{view.children}</div>
        {view.footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-card2/40 px-5 py-3">
            {view.footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
