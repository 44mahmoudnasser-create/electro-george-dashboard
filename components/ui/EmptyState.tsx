import { Inbox, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// حالة "مفيش بيانات" موحدة: أيقونة + رسالة + وصف وإجراء اختياريين
export default function EmptyState({
  message = "لا توجد بيانات", description, icon: Icon = Inbox, action, compact, className,
}: {
  message?: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(
      "flex animate-fade-in flex-col items-center justify-center text-center",
      compact ? "gap-2 py-8" : "gap-3 py-14",
      className,
    )}>
      <span className={cn(
        "grid place-items-center rounded-2xl border border-border/70 bg-card2/70 text-subtext",
        compact ? "size-10" : "size-12",
      )}>
        <Icon className={compact ? "size-[18px]" : "size-5"} strokeWidth={1.75} />
      </span>
      <div className="space-y-1 px-4">
        <p className="text-sm font-medium text-text">{message}</p>
        {description && <p className="mx-auto max-w-sm text-xs leading-5 text-subtext">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
