import { cn } from "@/lib/utils";
import { STATUS_COLORS } from "@/lib/utils";

export default function Badge({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("eg-badge", STATUS_COLORS[label] ?? "bg-slate-500/20 text-slate-300", className)}>
      {label}
    </span>
  );
}
