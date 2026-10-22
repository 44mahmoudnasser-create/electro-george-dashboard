"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { AlertTriangle, RotateCcw, ChevronLeft, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════ ثوابت ═══════════════ */

const STATUSES = ["لم يبدأ", "جاري", "متوقف", "مكتمل", "تم التسليم"] as const;
const DONE = ["مكتمل", "تم التسليم"];
const RANK: Record<string, number> = { "عاجلة": 0, "عالية": 1, "متوسطة": 2, "منخفضة": 3 };
const PRIORITY_STYLE: Record<string, string> = {
  "عاجلة": "bg-danger/15 text-danger",
  "عالية": "bg-warning/15 text-warning",
  "متوسطة": "bg-accent/15 text-accent",
  "منخفضة": "bg-card2 text-subtext",
};

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
  const canChange = role === "manager";

  const [view, setView] = useState<"items" | "orders">("items");
  const [month, setMonth] = useState(thisMonth);
  const [scope, setScope] = useState<"plan" | "all">("plan");
  const [statusFilter, setStatusFilter] = useState<string>("الكل");
  const [list, setList] = useState<ItemRow[]>(items);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [undoTarget, setUndoTarget] = useState<Row | null>(null);

  const flash = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    setTimeout(() => setNotice(null), 3000);
  };

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
      const sorted = [...bs].sort((a, b) => (RANK[a.priority] ?? 2) - (RANK[b.priority] ?? 2));
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

  const overallLate = useMemo(() => rows.filter(isLate).length, [rows, today]);

  const tableRows = useMemo(() => base
    .filter(r => statusFilter === "الكل" || r.status === statusFilter)
    .sort((a, b) => {
      const rank = (r: Row) => (isLate(r) ? 0 : DONE.includes(r.status) ? 2 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return (RANK[a.priority] ?? 2) - (RANK[b.priority] ?? 2);
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

  const confirmUndo = async () => {
    if (!undoTarget || undoTarget.itemId == null) return;
    // الإلغاء بيرجّع البند لـ "مكتمل"
    if (await setJob(undoTarget.itemId, "مكتمل")) flash(true, `تم إلغاء تسليم ${undoTarget.label}`);
    setUndoTarget(null);
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* ═══ الهيدر ═══ */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border/60 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-text">لوحة المصنع</h1>
            <p className="text-[11px] text-subtext">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-md border border-border overflow-hidden">
              {([["items", "البنود"], ["orders", "الأوامر"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => { setView(k); setStatusFilter("الكل"); }}
                  className={cn("px-3 py-1.5 text-xs transition-colors",
                    view === k ? "bg-accent/15 text-accent font-semibold" : "text-subtext hover:text-text")}>
                  {label}
                </button>
              ))}
            </div>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="eg-input !py-1.5 !text-xs w-40" />
            {month !== thisMonth && (
              <button onClick={() => setMonth(thisMonth)} className="text-xs text-accent hover:underline">الشهر الحالي</button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-5">
        {notice && (
          <div className={cn("text-xs px-3 py-2 rounded-lg border",
            notice.ok ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger")}>
            {notice.text}
          </div>
        )}

        {/* ═══ كل البنود / الأوامر حسب الحالة ═══ */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-subtext">{view === "items" ? "كل البنود" : "كل الأوامر"}</h2>
            {overallLate > 0 && <span className="text-[11px] text-danger">{overallLate} متأخر</span>}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {STATUSES.map(st => {
              const n = allCounts[st] ?? 0;
              const warn = st === "متوقف" && n > 0;
              return (
                <button key={st} onClick={() => { setScope("all"); setStatusFilter(st); }}
                  className={cn("eg-card !p-3 text-right transition-colors hover:border-accent/40", warn && "!border-warning/50")}>
                  <div className={cn("text-xl font-bold tabular-nums", warn ? "text-warning" : "text-text")}>{n}</div>
                  <div className="text-[11px] text-subtext">{st}</div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ═══ الخطة الشهرية ═══ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label={`مخطط لـ ${monthLabel}`} value={kpi.total} />
          <Kpi label="تم تسليمه" value={kpi.delivered} tone="success" sub={`${progressPct}% من الخطة`} />
          <Kpi label="جاري الآن" value={kpi.inProgress} tone="accent" />
          <Kpi label="متأخر" value={kpi.late} tone={kpi.late ? "danger" : "muted"} />
        </div>
        <div className="eg-card !p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-subtext">نسبة التسليم من خطة {monthLabel}</span>
            <span className="font-bold text-text tabular-nums">{kpi.delivered} / {kpi.total}</span>
          </div>
          <div className="h-2 rounded-full bg-card2 overflow-hidden">
            <div className="h-full bg-success transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* ═══ الجدول ═══ */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-2">
              {([["plan", `خطة ${monthLabel}`], ["all", view === "items" ? "كل البنود" : "كل الأوامر"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => { setScope(k); setStatusFilter("الكل"); }}
                  className={cn("px-3 py-1.5 rounded-md text-xs transition-colors",
                    scope === k ? "bg-accent/15 text-accent font-semibold" : "text-subtext hover:text-text")}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[{ key: "الكل", n: base.length }, ...STATUSES.map(s => ({ key: s, n: statusCounts[s] ?? 0 }))].map(({ key, n }) => (
                <button key={key} onClick={() => setStatusFilter(key)}
                  className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap border transition-colors",
                    statusFilter === key ? "bg-accent/15 border-accent/60 text-accent font-semibold"
                      : "bg-card2 border-border text-subtext hover:text-text")}>
                  {key}<span className="tabular-nums opacity-70">{n}</span>
                </button>
              ))}
            </div>

            <div className="eg-card !p-0 overflow-hidden">
              {tableRows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse min-w-[560px]">
                    <thead>
                      <tr className="bg-card2 text-subtext">
                        <th className="px-4 py-2 text-right font-semibold">{view === "items" ? "البند" : "الأمر"}</th>
                        <th className="px-3 py-2 text-right font-semibold">الحالة</th>
                        <th className="px-3 py-2 text-right font-semibold">الأولوية</th>
                        <th className="px-3 py-2 text-right font-semibold">التسليم المتوقع</th>
                        <th className="px-3 py-2 text-left font-semibold w-36">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map(r => {
                        const late = isLate(r);
                        const done = r.status === "تم التسليم";
                        const busy = r.itemId != null && busyId === r.itemId;
                        return (
                          <tr key={r.key} className="border-t border-border/40 hover:bg-card2/50">
                            <td className="px-4 py-2 cursor-pointer" onClick={() => router.push(`/work-orders/${r.woId}`)}>
                              <span className="font-mono font-semibold text-accent">{r.label}</span>
                              {r.sub && <div className="text-[11px] text-subtext truncate max-w-[280px]">{r.sub}</div>}
                            </td>
                            <td className="px-3 py-2"><Badge label={r.status} /></td>
                            <td className="px-3 py-2">
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded", PRIORITY_STYLE[r.priority] ?? PRIORITY_STYLE["منخفضة"])}>{r.priority}</span>
                            </td>
                            <td className={cn("px-3 py-2 tabular-nums", late ? "text-danger font-semibold" : "text-subtext")}>
                              {r.expected ?? "—"}{late && <span className="mr-1 text-[10px]">· متأخر</span>}
                            </td>
                            <td className="px-3 py-2 text-left">
                              {view === "items" && canChange && r.itemId != null ? (
                                done ? (
                                  <button onClick={() => setUndoTarget(r)} disabled={busy}
                                    className="inline-flex items-center gap-1 text-warning hover:underline disabled:opacity-40">
                                    <RotateCcw className="w-3.5 h-3.5" />إلغاء التسليم
                                  </button>
                                ) : r.status === "مكتمل" ? (
                                  <button onClick={() => deliver(r)} disabled={busy}
                                    className="inline-flex items-center gap-1 text-success hover:underline disabled:opacity-40">
                                    <PackageCheck className="w-3.5 h-3.5" />تسليم
                                  </button>
                                ) : <span className="text-subtext">—</span>
                              ) : <span className="text-subtext">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState message={base.length ? "لا توجد عناصر بهذه الحالة" : scope === "plan" ? `مفيش ${unit === "بند" ? "بنود" : "أوامر"} مخططة لـ ${monthLabel}` : "مفيش بيانات"} />}
            </div>
          </div>

          {/* ═══ الجانب ═══ */}
          <div className="space-y-4">
            <div className="eg-card !p-4 space-y-3">
              <h2 className="text-sm font-bold text-text flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />تحتاج قرار
              </h2>
              <ul className="space-y-2">
                {alerts.map((a, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 text-xs">
                    <span className={cn(a.tone === "danger" ? "text-danger" : a.tone === "warning" ? "text-warning" : "text-success")}>{a.text}</span>
                    {a.href && (
                      <button onClick={() => router.push(a.href!)} className="text-subtext hover:text-accent shrink-0">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div className="eg-card !p-4 space-y-3">
              <h2 className="text-sm font-bold text-text">حضور اليوم</h2>
              <div className="grid grid-cols-4 gap-2 text-center">
                <Mini label="حاضر" value={att.present} tone="success" />
                <Mini label="غياب" value={att.absent} tone="danger" />
                <Mini label="مأمورية" value={att.mission} tone="accent" />
                <Mini label="إجازة" value={att.leave} tone="warning" />
              </div>
              <button onClick={() => router.push("/attendance")} className="text-xs text-accent hover:underline">تفاصيل الحضور ←</button>
            </div>

            <button onClick={() => router.push("/purchases")}
              className="eg-card !p-4 w-full text-right flex items-center justify-between hover:border-accent/40 transition-colors">
              <div>
                <p className="text-xs text-subtext">طلبات الشراء المفتوحة</p>
                <p className="text-xl font-bold text-text tabular-nums">{openPurchases}</p>
              </div>
              <ChevronLeft className="w-4 h-4 text-subtext" />
            </button>
          </div>
        </div>
      </div>

      {/* ═══ تأكيد إلغاء التسليم ═══ */}
      <Modal open={!!undoTarget} onClose={() => setUndoTarget(null)} title="إلغاء التسليم" size="sm">
        {undoTarget && (
          <div className="space-y-4">
            <div className="bg-card2 rounded-lg p-3 text-xs space-y-1">
              <p className="text-text font-semibold font-mono">{undoTarget.label}</p>
              {undoTarget.sub && <p className="text-subtext">{undoTarget.sub}</p>}
              <p className="text-subtext">هيرجع للحالة <span className="text-text">مكتمل</span>.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setUndoTarget(null)} className="eg-btn-ghost flex-1 justify-center">تراجع</button>
              <button onClick={confirmUndo} disabled={busyId !== null} className="eg-btn-danger flex-1 justify-center">
                تأكيد الإلغاء
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ═══════════════ مكونات صغيرة ═══════════════ */

const TONES: Record<string, string> = {
  success: "text-success", danger: "text-danger", warning: "text-warning",
  accent: "text-accent", muted: "text-subtext", default: "text-text",
};

function Kpi({ label, value, sub, tone = "default" }: {
  label: string; value: number; sub?: string; tone?: keyof typeof TONES;
}) {
  return (
    <div className="eg-card !p-4">
      <div className={cn("text-2xl font-bold tabular-nums", TONES[tone])}>{value}</div>
      <div className="text-[11px] text-subtext mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-subtext/80 mt-1">{sub}</div>}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONES }) {
  return (
    <div className="bg-card2 rounded-lg py-2">
      <div className={cn("text-lg font-bold tabular-nums", TONES[tone])}>{value}</div>
      <div className="text-[10px] text-subtext">{label}</div>
    </div>
  );
}
