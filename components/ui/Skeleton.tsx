import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("eg-skeleton", className)} />;
}

// هيكل صفحة عام بيظهر وإحنا مستنيين بيانات الصفحة من السيرفر
export function PageSkeleton() {
  return (
    <div role="status" aria-label="جاري تحميل الصفحة" className="min-h-full animate-fade-in [animation-delay:120ms]">
      <div className="border-b border-border/60 px-4 py-4 md:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="hidden h-8 w-28 sm:block" />
        </div>
      </div>
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="eg-card !p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-6 w-14" />
            </div>
          ))}
        </div>
        <div className="eg-card overflow-hidden !p-0">
          <div className="border-b border-border/60 bg-card2/50 px-4 py-3">
            <Skeleton className="h-3 w-1/3" />
          </div>
          <div className="divide-y divide-border/50">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="hidden h-3 w-16 sm:block" />
                <Skeleton className="h-5 w-14 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
