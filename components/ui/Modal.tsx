"use client";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Modal({
  open, onClose, title, children, size = "md"
}: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; size?: "sm"|"md"|"lg"|"xl";
}) {
  if (!open) return null;
  const widths = { sm:"max-w-sm", md:"max-w-lg", lg:"max-w-2xl", xl:"max-w-4xl" };
  return (
    <div className="eg-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={cn("eg-modal w-full", widths[size])}>
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <button onClick={onClose} className="text-subtext hover:text-danger transition-colors">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-text">{title}</h2>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
