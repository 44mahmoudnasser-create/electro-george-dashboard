import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   هيكل الصفحة الموحد:
   <Page width="6xl">
     <PageHeader title="..." icon={X} actions={...}> فلاتر أو تبويبات </PageHeader>
     <PageBody> المحتوى </PageBody>
   </Page>
   الهيدر ثابت فوق وعرضه كامل، والمحتوى جواه متوسّط بأقصى عرض للصفحة.
   ═══════════════════════════════════════════════════════════════ */

const WIDTHS = { "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem", full: "100%" } as const;
export type PageWidth = keyof typeof WIDTHS;

export function Page({ width = "6xl", className, children }: {
  width?: PageWidth; className?: string; children: React.ReactNode;
}) {
  return (
    <div
      className={cn("min-h-full animate-page-in", className)}
      style={{ "--page-max": WIDTHS[width] } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title, subtitle, icon: Icon, back, meta, actions, children, tabs, className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  /** زرار رجوع للصفحة الأم */
  back?: { href: string; label: string };
  /** شارات جنب العنوان (حالة، متأخر ...) */
  meta?: React.ReactNode;
  /** أزرار الإجراءات على الطرف التاني */
  actions?: React.ReactNode;
  /** صف تاني تحت العنوان: فلاتر */
  children?: React.ReactNode;
  /** تبويبات <Tabs> — بتتحط على الخط اللي تحت الهيدر */
  tabs?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn(
      "sticky top-0 z-20 border-b border-border/60 bg-bg/80 backdrop-blur-xl supports-[backdrop-filter]:bg-bg/70",
      className,
    )}>
      <div className="mx-auto w-full max-w-[var(--page-max)] px-4 py-3 md:px-6 md:py-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* basis 14rem: لو المساحة مش كفاية الأزرار بتنزل سطر جديد بدل ما العنوان يتقص */}
          <div className="flex min-w-0 flex-[1_1_14rem] items-center gap-3">
            {back && (
              <Link href={back.href} aria-label={`رجوع إلى ${back.label}`} title={back.label}
                className="eg-btn-ghost eg-btn-sm eg-btn-icon shrink-0">
                <ChevronRight className="size-4" />
              </Link>
            )}
            {Icon && (
              <span className="hidden size-9 shrink-0 place-items-center rounded-lg border border-border/80 bg-card2 text-accent shadow-card sm:grid">
                <Icon className="size-[18px]" strokeWidth={1.9} />
              </span>
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="truncate text-lg font-bold leading-7 text-text">{title}</h1>
                {meta}
              </div>
              {subtitle && <div className="truncate text-xs leading-5 text-subtext">{subtitle}</div>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {children && <div className="mt-3 space-y-2.5">{children}</div>}
        {tabs && <div className="-mb-3 mt-2 md:-mb-3.5">{tabs}</div>}
      </div>
    </header>
  );
}

export function PageBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("mx-auto w-full max-w-[var(--page-max)] space-y-5 px-4 py-5 md:px-6 md:py-6", className)}>
      {children}
    </div>
  );
}

// عنوان قسم جوه كارت: عنوان + وصف + إجراءات على الطرف التاني
export function SectionHeader({
  title, description, actions, icon: Icon, className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-3 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold leading-6 text-text">
          {Icon && <Icon className="size-4 shrink-0 text-subtext" />}
          {title}
        </h2>
        {description && <p className="text-xs leading-5 text-subtext">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
