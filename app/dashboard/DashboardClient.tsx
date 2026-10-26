"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Spinner from "@/components/ui/Spinner";
import { Page, PageHeader, PageBody, SectionHeader } from "@/components/ui/Page";
import { StatCard, ProgressBar } from "@/components/ui/StatCard";
import { Segmented } from "@/components/ui/Tabs";
import { FilterChip, ChipRow } from "@/components/ui/Filters";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { PRIORITY_RANK, TONE_TEXT, toneFor, type Tone } from "@/lib/status";
import {
  LayoutDashboard, Target, PackageCheck, Activity, CalendarClock, RotateCcw, ChevronLeft,
  AlertTriangle, CheckCircle2, BellRing, CalendarCheck, ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════ ثوابت ═══════════════ */

const STATUSES = ["لم يبدأ", "جاري", "متوقف", "مكتمل", "تم التسليم"] as const;
const DONE = ["مكتمل", "تم التسليم"];

// لون كل حالة كخلفية (نقطة الكارت وشريط التوزيع) — نفس ألوان الشارات في lib/status
const TONE_BG: Record<Tone, string> = {
  neutral: "bg-subtext/60",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  violet: "bg-accent2",
};

// شكل كل نوع تنبيه في "تحتاج قرار"
const ALERT_STYLE = {
  danger: { icon: AlertTriangle, box: "bg-danger/10 text-danger" },
  warning: { icon: AlertTriangle, box: "bg-warning/10 text-warning" },
  ok: { icon: CheckCircle2, box: "bg-success/10 text-success" },
} as const;

type ItemRow = {
  id: number; wo_id: number; item_no: number; description: string | null; qty: number | null;
  job_status: string; priority: string; expected_delivery: string | null; plan_month: string | null;
  work_order: { wo_number: string; client_name: string | null; project_name: string | null } | null;
};
type Att = { id: number; status: string; technician?: { name: string; department: string | null } };
type PurchaseItem = {
  id: number; item_name: string; status: string; supply_date: string | null;
  purchase_order?: { order_no: string | null; work_order?: { wo_number: string } | null } | null;
};

// صف في الجدول: بند (وضع البنود) أو أمر مجمّع من بنوده (وضع الأوامر)
type Row = {
  key: string;
  woId: number;
  itemId: number | null;     // موجود في وضع البنود بس
  label: string;
  sub: string;
  status: string;
  priority: string;
  expected: string | null;
  months: string[];
};

// نفس قاعدة الحالة العامة اللي في الداتابيز (wo_status_from_items)
const deriveStatus = (statuses: string[]): string => {
  if (statuses.length === 0) return "لم يبدأ";
  if (statuses.every(s => s === "تم التسليم")) return "تم التسليم";
  if (statuses.every(s => DONE.includes(s))) return "مكتمل";
  if (statuses.every(s => s === "لم يبدأ")) return "لم يبدأ";
  if (statuses.includes("جاري")) return "جاري";
  if (statuses.includes("متوقف")) return "متوقف";
  return "جاري";
};

export default function DashboardClient({
  items, attendance, purchaseItems, violationsThisMonth, today, thisMonth, role,
}: {
  items: ItemRow[]; attendance: Att[]; purchaseItems: PurchaseItem[];
  violationsThisMonth: number; today: string; thisMonth: string; role: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const canChange = role === "manager";

  const [view, setView] = useState<"items" | "orders">("items");
  const [month, setMonth] = useState(thisMonth);
  const [scope, setScope] = useState<"plan" | "all">("plan");
  const [statusFilter, setStatusFilter] = useState<string>("الكل");
  const [list, setList] = useState<ItemRow[]>(items);
  const [busyId, setBusyId] = useState<number | null>(null);

  const flash = (ok: boolean, text: string) => toast.show(ok, text);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return month;
    return new Date(y, m - 1, 1).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
  }, [month]);

  const todayLabel = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ar-EG", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
    });
  }, [today]);

  /* ═══════════════ بناء الصفوف حسب الوضع ═══════════════ */
  const rows: Row[] = useMemo(() => {
    if (view === "items") {
      return list.map(it => ({
        key: `i${it.id}`,
        woId: it.wo_id,
        itemId: it.id,
        label: `${it.work_order?.wo_number ?? "—"} · #${it.item_no}`,
        sub: it.description ?? "",
        status: it.job_status,
        priority: it.priority,
        expected: it.expected_delivery,
        months: it.plan_month ? [it.plan_month] : [],
      }));
    }
    // وضع الأوامر: تجميع البنود تحت كل أمر
    const byWo = new Map<number, ItemRow[]>();
    list.forEach(it => {
      if (!byWo.has(it.wo_id)) byWo.set(it.wo_id, []);
      byWo.get(it.wo_id)!.push(it);
    });
    return Array.from(byWo.entries()).map(([woId, bs]) => {
      const wo = bs[0].work_order;
      const sorted = [...bs].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2));
      const dates = bs.map(b => b.expected_delivery).filter(Boolean) as string[];
      return {
        key: `w${woId}`,
        woId,
        itemId: null,
        label: wo?.wo_number ?? "—",
        sub: [wo?.client_name, wo?.project_name].filter(Boolean).join(" · ") || `${bs.length} بند`,
        status: deriveStatus(bs.map(b => b.job_status)),
        priority: sorted[0]?.priority ?? "متوسطة",
        expected: dates.length ? [...dates].sort()[0] : null,
        months: Array.from(new Set(bs.map(b => b.plan_month).filter(Boolean) as string[])),
      };
    });
  }, [view, list]);

  const isLate = (r: Row) => !!r.expected && r.expected < today && !DONE.includes(r.status);

  /* ═══════════════ الخطة الشهرية ═══════════════ */
  const planned = useMemo(() => rows.filter(r => r.months.includes(month)), [rows, month]);
  const base = useMemo(() => (scope === "plan" ? planned : rows), [scope, planned, rows]);

  const kpi = useMemo(() => ({
    total: planned.length,
    delivered: planned.filter(r => r.status === "تم التسليم").length,
    inProgress: planned.filter(r => r.status === "جاري").length,
    late: planned.filter(isLate).length,
  }), [planned, today]);

  const progressPct = kpi.total ? Math.round((kpi.delivered / kpi.total) * 100) : 0;

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    STATUSES.forEach(s => (c[s] = 0));
    base.forEach(r => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [base]);

  const allCounts = useMemo(() => {
    const c: Record<string, number> = {};
    STATUSES.forEach(s => (c[s] = 0));
    rows.forEach(r => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  // مجموع الحالات الخمسة (أساس شريط التوزيع)
  const statusTotal = STATUSES.reduce((sum, s) => sum + (allCounts[s] ?? 0), 0);

  const overallLate = useMemo(() => rows.filter(isLate).length, [rows, today]);

  const tableRows = useMemo(() => base
    .filter(r => statusFilter === "الكل" || r.status === statusFilter)
    .sort((a, b) => {
      const rank = (r: Row) => (isLate(r) ? 0 : DONE.includes(r.status) ? 2 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
    }), [base, statusFilter, today]);

  /* ═══════════════ تنبيهات تحتاج قرار ═══════════════ */
  const unit = view === "items" ? "بند" : "أمر";
  const alerts = useMemo(() => {
    const out: { text: string; tone: "danger" | "warning" | "ok"; href?: string }[] = [];
    if (overallLate > 0) out.push({ text: `${overallLate} ${unit} متأخر عن موعد التسليم`, tone: "danger" });
    const stopped = rows.filter(r => r.status === "متوقف").length;
    if (stopped > 0) out.push({ text: `${stopped} ${unit} متوقف`, tone: "warning" });
    const latePurchases = purchaseItems.filter(p => p.status === "مفتوح" && p.supply_date && p.supply_date < today);
    if (latePurchases.length > 0) out.push({ text: `${latePurchases.length} صنف شراء متأخر التوريد`, tone: "warning", href: "/purchases" });
    const absent = attendance.filter(a => a.status === "غياب").length;
    if (absent > 2) out.push({ text: `${absent} غياب اليوم`, tone: "warning", href: "/attendance" });
    if (violationsThisMonth > 3) out.push({ text: `${violationsThisMonth} مخالفة هذا الشهر`, tone: "warning", href: "/violations" });
    if (out.length === 0) out.push({ text: "لا توجد تنبيهات تحتاج قرار", tone: "ok" });
    return out;
  }, [overallLate, rows, purchaseItems, attendance, violationsThisMonth, today, unit]);

  /* ═══════════════ الحضور اليوم ═══════════════ */
  const att = useMemo(() => {
    const c = (s: string) => attendance.filter(a => a.status === s).length;
    return { present: c("حاضر"), absent: c("غياب"), mission: c("مأمورية"), leave: c("أجازة") };
  }, [attendance]);

  const openPurchases = purchaseItems.filter(p => p.status === "مفتوح").length;

  /* ═══════════════ تسليم / إلغاء تسليم (على البنود) ═══════════════ */
  const setJob = async (itemId: number, next: string) => {
    setBusyId(itemId);
    const { error } = await supabase.from("work_order_items").update({ job_status: next }).eq("id", itemId);
    setBusyId(null);
    if (error) { flash(false, error.message); return false; }
    setList(prev => prev.map(it => it.id === itemId ? { ...it, job_status: next } : it));
    return true;
  };

  const deliver = async (r: Row) => {
    if (r.itemId == null) return;
    if (await setJob(r.itemId, "تم التسليم")) flash(true, `تم تسليم ${r.label}`);
  };

  const undoDelivery = async (r: Row) => {
    if (r.itemId == null) return;
    const ok = await confirm({
      title: "إلغاء التسليم",
      message: (
        <div className="space-y-2.5">
          <div className="space-y-0.5 rounded-lg border border-border/60 bg-card2/60 px-3 py-2 text-xs leading-5">
            <p className="font-mono font-semibold text-text">{r.label}</p>
            {r.sub && <p className="text-subtext">{r.sub}</p>}
          </div>
          <p>هيرجع للحالة <span className="font-semibold text-text">مكتمل</span>.</p>
        </div>
      ),
      confirmText: "تأكيد الإلغاء",
      cancelText: "تراجع",
      tone: "danger",
    });
    if (!ok) return;
    // الإلغاء بيرجّع البند لـ "مكتمل"
    if (await setJob(r.itemId, "مكتمل")) flash(true, `تم إلغاء تسليم ${r.label}`);
  };

  // عمود الإجراء بيظهر بس لما يكون فيه إجراء ممكن (المدير في وضع البنود)
  const showActions = view === "items" && canChange;
  const allLabel = view === "items" ? "كل البنود" : "كل الأوامر";

  return (
    <Page width="6xl">
      <PageHeader
        title="لوحة المصنع"
        icon={LayoutDashboard}
        subtitle={todayLabel}
        actions={<>
          <Segmented
            value={view}
            onChange={v => { setView(v); setStatusFilter("الكل"); }}
            ariaLabel="طريقة العرض"
            items={[{ value: "items", label: "البنود" }, { value: "orders", label: "الأوامر" }]}
          />
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            aria-label="شهر الخطة" className="eg-input eg-input-sm w-40" />
          {month !== thisMonth && (
            <button onClick={() => setMonth(thisMonth)} className="eg-btn-subtle eg-btn-sm text-accent">
              الشهر الحالي
            </button>
          )}
        </>}
      />

      <PageBody>
        {/* ═══ الخطة الشهرية ═══ */}
        <section aria-label={`خطة ${monthLabel}`} className="eg-stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={`مخطط لـ ${monthLabel}`} value={kpi.total} icon={Target} />
          <StatCard
            label="تم تسليمه"
            value={<>{kpi.delivered}<span className="ms-1.5 text-sm font-medium text-subtext">/ {kpi.total}</span></>}
            tone="success"
            icon={PackageCheck}
            hint={`نسبة التسليم من خطة ${monthLabel}`}
            sub={<>
              <ProgressBar value={progressPct} tone="success" label={`نسبة التسليم من خطة ${monthLabel}`} className="mb-1 mt-2" />
              <span className="tabular-nums">{progressPct}% من الخطة</span>
            </>}
          />
          <StatCard label="جاري الآن" value={kpi.inProgress} tone="accent" icon={Activity} />
          <StatCard label="متأخر" value={kpi.late} tone={kpi.late ? "danger" : "muted"} icon={CalendarClock} />
        </section>

        {/* ═══ كل البنود / الأوامر حسب الحالة ═══ */}
        <section className="space-y-3">
          <SectionHeader
            title={allLabel}
            description="اضغط على أي حالة علشان تعرضها في الجدول."
            actions={overallLate > 0 ? <Badge tone="danger" label={`${overallLate} متأخر`} /> : undefined}
          />
          {statusTotal > 0 && (
            <div
              role="img"
              aria-label={STATUSES.map(s => `${s} ${allCounts[s] ?? 0}`).join("، ")}
              className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
            >
              {STATUSES.map(s => {
                const n = allCounts[s] ?? 0;
                if (!n) return null;
                return (
                  <span key={s} title={`${s}: ${n}`}
                    className={cn("h-full min-w-[3px] transition-[width] duration-500 ease-out", TONE_BG[toneFor(s)])}
                    style={{ width: `${(n / statusTotal) * 100}%` }} />
                );
              })}
            </div>
          )}
          <div className="eg-stagger grid grid-cols-2 gap-3 sm:grid-cols-5">
            {STATUSES.map((st, i) => {
              const n = allCounts[st] ?? 0;
              const warn = st === "متوقف" && n > 0;
              const active = scope === "all" && statusFilter === st;
              return (
                <StatCard
                  key={st}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE_BG[toneFor(st)])} />
                      {st}
                    </span>
                  }
                  value={n}
                  tone={warn ? "warning" : "default"}
                  onClick={() => { setScope("all"); setStatusFilter(st); }}
                  active={active}
                  className={cn(warn && !active && "!border-warning/40", i === STATUSES.length - 1 && "col-span-2 sm:col-span-1")}
                />
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* ═══ الجدول ═══ */}
          <section className="eg-card overflow-hidden !p-0 lg:col-span-2">
            <div className="space-y-3 border-b border-border/60 px-4 pb-3 pt-4">
              <Segmented
                value={scope}
                onChange={k => { setScope(k); setStatusFilter("الكل"); }}
                ariaLabel="نطاق الجدول"
                items={[{ value: "plan", label: `خطة ${monthLabel}` }, { value: "all", label: allLabel }]}
              />
              <ChipRow>
                <FilterChip active={statusFilter === "الكل"} onClick={() => setStatusFilter("الكل")} count={base.length}>الكل</FilterChip>
                {STATUSES.map(s => (
                  <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} count={statusCounts[s] ?? 0}>{s}</FilterChip>
                ))}
              </ChipRow>
            </div>

            {tableRows.length ? (
              <div className="overflow-x-auto">
                <table className="eg-table min-w-[600px]">
                  <thead>
                    <tr>
                      <th>{view === "items" ? "البند" : "الأمر"}</th>
                      <th>الحالة</th>
                      <th>الأولوية</th>
                      <th>التسليم المتوقع</th>
                      {showActions && <th className="w-32 text-end">إجراء</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map(r => {
                      const late = isLate(r);
                      const done = r.status === "تم التسليم";
                      const busy = r.itemId != null && busyId === r.itemId;
                      const href = `/work-orders/${r.woId}`;
                      return (
                        <tr key={r.key}>
                          <td className="cursor-pointer" onClick={() => router.push(href)}>
                            <Link href={href} onClick={e => e.stopPropagation()}
                              className="font-mono text-[13px] font-semibold text-accent underline-offset-4 hover:underline">
                              {r.label}
                            </Link>
                            {r.sub && <div className="max-w-[280px] truncate text-[11px] text-subtext">{r.sub}</div>}
                          </td>
                          <td><Badge label={r.status} /></td>
                          <td>{r.priority ? <Badge label={r.priority} dot={false} /> : <span className="text-muted">—</span>}</td>
                          <td className={cn("tabular-nums", late ? "font-semibold text-danger" : "text-subtext")}>
                            {r.expected ?? "—"}
                            {late && <span className="ms-1.5 rounded bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium">متأخر</span>}
                          </td>
                          {showActions && (
                            <td className="text-end">
                              {view === "items" && canChange && r.itemId != null ? (
                                done ? (
                                  <button onClick={() => undoDelivery(r)} disabled={busy} className="eg-btn-danger-soft eg-btn-xs">
                                    {busy ? <Spinner className="size-3.5" /> : <RotateCcw className="size-3.5" />}إلغاء التسليم
                                  </button>
                                ) : r.status === "مكتمل" ? (
                                  <button onClick={() => deliver(r)} disabled={busy} className="eg-btn-success eg-btn-xs">
                                    {busy ? <Spinner className="size-3.5" /> : <PackageCheck className="size-3.5" />}تسليم
                                  </button>
                                ) : <span className="text-muted">—</span>
                              ) : <span className="text-muted">—</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                message={base.length ? "لا توجد عناصر بهذه الحالة" : scope === "plan" ? `مفيش ${unit === "بند" ? "بنود" : "أوامر"} مخططة لـ ${monthLabel}` : "مفيش بيانات"}
                description={!base.length && scope === "plan" && rows.length > 0 ? `اختار شهر تاني من فوق، أو اعرض ${allLabel}.` : undefined}
                action={base.length > 0
                  ? <button onClick={() => setStatusFilter("الكل")} className="eg-btn-ghost eg-btn-sm">مسح الفلتر</button>
                  : scope === "plan" && rows.length > 0
                    ? <button onClick={() => { setScope("all"); setStatusFilter("الكل"); }} className="eg-btn-ghost eg-btn-sm">عرض {allLabel}</button>
                    : undefined}
              />
            )}
          </section>

          {/* ═══ الجانب ═══ */}
          <aside className="space-y-4">
            <section className="eg-card !p-4">
              <SectionHeader title="تحتاج قرار" icon={BellRing} />
              <ul className="-mx-1.5 mt-2 space-y-0.5">
                {alerts.map((a, i) => {
                  const s = ALERT_STYLE[a.tone];
                  const Icon = s.icon;
                  const body = (
                    <>
                      <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", s.box)}>
                        <Icon className="size-3.5" />
                      </span>
                      <span className={cn("min-w-0 flex-1 text-xs leading-5", a.tone === "ok" ? "text-subtext" : "text-text")}>
                        {a.text}
                      </span>
                    </>
                  );
                  return (
                    <li key={i}>
                      {a.href ? (
                        <Link href={a.href}
                          className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-card2">
                          {body}
                          <ChevronLeft className="size-4 shrink-0 text-muted transition-[color,transform] duration-150 group-hover:-translate-x-0.5 group-hover:text-accent" />
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2.5 px-1.5 py-1.5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="eg-card space-y-3 !p-4">
              <SectionHeader
                title="حضور اليوم"
                icon={CalendarCheck}
                actions={
                  <Link href="/attendance" className="eg-link inline-flex items-center gap-0.5 text-xs">
                    تفاصيل الحضور<ChevronLeft className="size-3.5" />
                  </Link>
                }
              />
              <div className="grid grid-cols-4 gap-2">
                <MiniStat label="حاضر" value={att.present} tone="success" />
                <MiniStat label="غياب" value={att.absent} tone="danger" />
                <MiniStat label="مأمورية" value={att.mission} tone="accent" />
                <MiniStat label="إجازة" value={att.leave} tone="warning" />
              </div>
            </section>

            <Link href="/purchases"
              className="eg-card group flex items-center gap-3 !p-4 transition-colors hover:border-border-strong hover:bg-card2/40">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-card2 text-subtext transition-colors group-hover:text-accent">
                <ShoppingCart className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-subtext">طلبات الشراء المفتوحة</span>
                <span className="block text-xl font-bold leading-7 tabular-nums text-text">{openPurchases}</span>
              </span>
              <ChevronLeft className="size-4 shrink-0 text-muted transition-[color,transform] duration-150 group-hover:-translate-x-0.5 group-hover:text-accent" />
            </Link>
          </aside>
        </div>
      </PageBody>
    </Page>
  );
}

/* ═══════════════ مكونات صغيرة ═══════════════ */

// رقم صغير في كارت حضور اليوم (بيبهت لو صفر)
function MiniStat({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONE_TEXT }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card2/50 px-1 py-2 text-center">
      <div className={cn("text-lg font-bold leading-7 tabular-nums", value ? TONE_TEXT[tone] : "text-subtext")}>{value}</div>
      <div className="text-[11px] leading-4 text-subtext">{label}</div>
    </div>
  );
}
