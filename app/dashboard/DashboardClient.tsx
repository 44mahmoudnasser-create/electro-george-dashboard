"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { AlertTriangle, CheckCircle2, RotateCcw, ChevronLeft, PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════ ثوابت ═══════════════ */

const STATUSES = ["لم يبدأ", "جاري", "متوقف", "مكتمل", "تم التسليم"] as const;
const DONE = ["مكتمل", "تم التسليم"];
const PRIORITY_STYLE: Record<string, string> = {
  "عاجلة": "bg-danger/15 text-danger",
  "عالية": "bg-warning/15 text-warning",
  "متوسطة": "bg-accent/15 text-accent",
  "منخفضة": "bg-card2 text-subtext",
};

type WO = {
  id: number; wo_number: string; description: string | null; status: string;
  priority: string | null; plan_month: string | null; expected_delivery: string | null;
  completion_date: string | null; department: string | null;
};
type Att = { id: number; status: string; technician?: { name: string; department: string | null } };
type PurchaseItem = {
  id: number; item_name: string; status: string; supply_date: string | null;
  purchase_order?: { order_no: string | null; work_order?: { wo_number: string } | null } | null;
};

export default function DashboardClient({
  wos, attendance, purchaseItems, violationsThisMonth, today, thisMonth, role,
}: {
  wos: WO[]; attendance: Att[]; purchaseItems: PurchaseItem[];
  violationsThisMonth: number; today: string; thisMonth: string; role: string;
}) {
  const router = useRouter();
  const canDeliver = role === "admin" || role === "manager";

  const [month, setMonth] = useState(thisMonth);
  const [statusFilter, setStatusFilter] = useState<string>("الكل");
  const [list, setList] = useState<WO[]>(wos);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // تأكيد إلغاء التسليم
  const [undoTarget, setUndoTarget] = useState<WO | null>(null);
  const [undoReason, setUndoReason] = useState("");

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

  const flash = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    setTimeout(() => setNotice(null), 3000);
  };

  /* ═══════════════ الأوامر المخططة للشهر (plan_month) ═══════════════ */
  const planned = useMemo(() => list.filter(w => w.plan_month === month), [list, month]);

  const isLate = (w: WO) => !!w.expected_delivery && w.expected_delivery < today && !DONE.includes(w.status);

  const kpi = useMemo(() => ({
    total: planned.length,
    delivered: planned.filter(w => w.status === "تم التسليم").length,
    inProgress: planned.filter(w => w.status === "جاري").length,
    late: planned.filter(isLate).length,
  }), [planned, today]);

  const progressPct = kpi.total ? Math.round((kpi.delivered / kpi.total) * 100) : 0;

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    STATUSES.forEach(s => (c[s] = 0));
    planned.forEach(w => { c[w.status] = (c[w.status] ?? 0) + 1; });
    return c;
  }, [planned]);

  const tableRows = useMemo(() => planned
    .filter(w => statusFilter === "الكل" || w.status === statusFilter)
    .sort((a, b) => {
      // المتأخر الأول، بعدين غير المكتمل، بعدين المكتمل
      const rank = (w: WO) => (isLate(w) ? 0 : DONE.includes(w.status) ? 2 : 1);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      return (a.expected_delivery ?? "9999").localeCompare(b.expected_delivery ?? "9999");
    }), [planned, statusFilter, today]);

  /* ═══════════════ تنبيهات تحتاج قرار ═══════════════ */
  const alerts = useMemo(() => {
    const out: { text: string; tone: "danger" | "warning" | "ok"; href?: string }[] = [];
    if (kpi.late > 0) out.push({ text: `${kpi.late} أمر شغل متأخر عن موعد التسليم`, tone: "danger" });
    const stopped = planned.filter(w => w.status === "متوقف").length;
    if (stopped > 0) out.push({ text: `${stopped} أمر شغل متوقف`, tone: "warning" });
    const latePurchases = purchaseItems.filter(p => p.status === "مفتوح" && p.supply_date && p.supply_date < today);
    if (latePurchases.length > 0) out.push({ text: `${latePurchases.length} صنف شراء متأخر التوريد`, tone: "warning", href: "/purchases" });
    const absent = attendance.filter(a => a.status === "غياب").length;
    if (absent > 2) out.push({ text: `${absent} غياب اليوم`, tone: "warning", href: "/attendance" });
    if (violationsThisMonth > 3) out.push({ text: `${violationsThisMonth} مخالفة هذا الشهر`, tone: "warning", href: "/violations" });
    if (out.length === 0) out.push({ text: "لا توجد تنبيهات تحتاج قرار", tone: "ok" });
    return out;
  }, [kpi.late, planned, purchaseItems, attendance, violationsThisMonth, today]);

  /* ═══════════════ الحضور اليوم ═══════════════ */
  const att = useMemo(() => {
    const c = (s: string) => attendance.filter(a => a.status === s).length;
    return { present: c("حاضر"), absent: c("غياب"), mission: c("مأمورية"), leave: c("أجازة") };
  }, [attendance]);

  const openPurchases = purchaseItems.filter(p => p.status === "مفتوح").length;

  /* ═══════════════ تسليم / إلغاء تسليم ═══════════════ */
  const updateWO = async (w: WO, patch: Partial<WO>) => {
    setBusyId(w.id);
    const { error } = await supabase.from("work_orders").update(patch).eq("id", w.id);
    setBusyId(null);
    if (error) { flash(false, error.message); return false; }
    setList(prev => prev.map(x => x.id === w.id ? { ...x, ...patch } : x));
    return true;
  };

  const deliver = async (w: WO) => {
    const ok = await updateWO(w, {
      status: "تم التسليم",
      completion_date: w.completion_date ?? today,
    });
    if (ok) flash(true, `تم تسليم ${w.wo_number}`);
  };

  const confirmUndo = async () => {
    if (!undoTarget) return;
    // الإلغاء بيرجع الأمر لـ "مكتمل" (مش بيمسح تاريخ الإتمام)
    const ok = await updateWO(undoTarget, { status: "مكتمل" });
    if (ok) flash(true, `تم إلغاء تسليم ${undoTarget.wo_number}`);
    setUndoTarget(null);
    setUndoReason("");
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
          <div className="flex items-center gap-2">
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

        {/* ═══ الكروت الأساسية (الشهر المختار) ═══ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label={`مخطط لـ ${monthLabel}`} value={kpi.total} />
          <Kpi label="تم تسليمه" value={kpi.delivered} tone="success" sub={`${progressPct}% من الخطة`} />
          <Kpi label="جاري الآن" value={kpi.inProgress} tone="accent" />
          <Kpi label="متأخر" value={kpi.late} tone={kpi.late ? "danger" : "muted"} />
        </div>

        {/* شريط التقدم */}
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
          {/* ═══ جدول الخطة ═══ */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[{ key: "الكل", n: kpi.total }, ...STATUSES.map(s => ({ key: s, n: statusCounts[s] ?? 0 }))].map(({ key, n }) => (
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
                        <th className="px-4 py-2 text-right font-semibold">أمر الشغل</th>
                        <th className="px-3 py-2 text-right font-semibold">الحالة</th>
                        <th className="px-3 py-2 text-right font-semibold">التسليم المتوقع</th>
                        <th className="px-3 py-2 text-left font-semibold w-36">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map(w => {
                        const late = isLate(w);
                        const done = w.status === "تم التسليم";
                        const busy = busyId === w.id;
                        return (
                          <tr key={w.id} className="border-t border-border/40 hover:bg-card2/50">
                            <td className="px-4 py-2 cursor-pointer" onClick={() => router.push(`/work-orders/${w.id}`)}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold text-accent">{w.wo_number}</span>
                                {w.priority && (
                                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded", PRIORITY_STYLE[w.priority] ?? PRIORITY_STYLE["منخفضة"])}>{w.priority}</span>
                                )}
                              </div>
                              {w.description && <div className="text-[11px] text-subtext truncate max-w-[280px]">{w.description}</div>}
                            </td>
                            <td className="px-3 py-2"><Badge label={w.status} /></td>
                            <td className={cn("px-3 py-2 tabular-nums", late ? "text-danger font-semibold" : "text-subtext")}>
                              {w.expected_delivery ?? "—"}{late && <span className="mr-1 text-[10px]">· متأخر</span>}
                            </td>
                            <td className="px-3 py-2 text-left">
                              {!canDeliver ? null : done ? (
                                <button onClick={() => { setUndoTarget(w); setUndoReason(""); }} disabled={busy}
                                  className="inline-flex items-center gap-1 text-warning hover:underline disabled:opacity-40">
                                  <RotateCcw className="w-3.5 h-3.5" />إلغاء التسليم
                                </button>
                              ) : w.status === "مكتمل" ? (
                                <button onClick={() => deliver(w)} disabled={busy}
                                  className="inline-flex items-center gap-1 text-success hover:underline disabled:opacity-40">
                                  <PackageCheck className="w-3.5 h-3.5" />تسليم
                                </button>
                              ) : (
                                <span className="text-subtext">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState message={planned.length ? "لا توجد أوامر بهذه الحالة" : `مفيش أوامر مخططة لـ ${monthLabel}`} />}
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
                    <span className={cn(
                      a.tone === "danger" ? "text-danger" : a.tone === "warning" ? "text-warning" : "text-success"
                    )}>{a.text}</span>
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
              <button onClick={() => router.push("/attendance")} className="text-xs text-accent hover:underline">
                تفاصيل الحضور ←
              </button>
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
              <p className="text-text font-semibold font-mono">{undoTarget.wo_number}</p>
              {undoTarget.description && <p className="text-subtext">{undoTarget.description}</p>}
              <p className="text-subtext">هيرجع للحالة <span className="text-text">مكتمل</span>. تاريخ الإتمام مش هيتمسح.</p>
            </div>
            <div>
              <label className="eg-label">سبب الإلغاء (اختياري)</label>
              <input value={undoReason} onChange={e => setUndoReason(e.target.value)} className="eg-input"
                placeholder="مثال: العميل رجّع الأمر لتعديل بسيط" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setUndoTarget(null)} className="eg-btn-ghost flex-1 justify-center">تراجع</button>
              <button onClick={confirmUndo} disabled={busyId !== null} className="eg-btn-danger flex-1 justify-center">
                <CheckCircle2 className="w-4 h-4" />تأكيد الإلغاء
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
