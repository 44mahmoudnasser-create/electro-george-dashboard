import { cn } from "@/lib/utils";

// مؤشر تحميل دائري — بياخد لون النص اللي حواليه (يتحط جوه الأزرار عادي)
export default function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="جاري التحميل"
      className={cn("inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80", className)}
    />
  );
}
