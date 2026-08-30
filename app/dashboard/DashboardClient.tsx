"use client";
import { useState, useMemo } from "react";
import { WorkOrder, Purchase, Attendance, Violation } from "@/types";
import KpiCard from "@/components/ui/KpiCard";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";

/* ── helpers ── */
const STATUSES = ["لم يبدأ","جاري","متوقف","مكتمل","تم التسليم"];
const STATUS_ICONS: Record<string,string> = {
  "لم يبدأ":"⚪","جاري":"🔵","متوقف":"🟡","مكتمل":"🟢","تم التسليم":"✅"
};

export default function DashboardClient({
  wos, attendance, purchases, violations, expectedDeliveries, today, thisMonth, role
}: {
  wos: WorkOrder[];
  attendance: (Attendance & { technician?: { name:string; route:string } })[];
  purchases: (Purchase & { work_order?: { wo_number:string } })[];
  violations: (Violation & { technician?: { name:string } })[];
  expectedDeliveries: WorkOrder[];
  today: string; thisMonth: string; role: string;
}) {
  const [modal, setModal] = useState<{ type:string; data?:unknown[] } | null>(null);

  /* ── KPI calculations ── */
  const totalWOs   = wos.length;
  const activeWOs  = wos.filter(w => w.status === "جاري").length;
  const doneWOs    = wos.filter(w => w.status === "مكتمل").length;
  const lateWOs    = wos.filter(w =>
    w.expected_delivery && w.expected_delivery < today &&
    !["مكتمل","تم التسليم"].includes(w.status)).length;
  const lateWOList = wos.filter(w =>
    w.expected_delivery && w.expected_delivery < today &&
    !["مكتمل","تم التسليم"].includes(w.status));

  const presentToday  = attendance.filter(a => a.status === "حاضر").length;
  const absentToday   = attendance.filter(a => a.status === "غياب");
  const missionToday  = attendance.filter(a => a.status === "مأمورية").length;
  const leaveToday    = attendance.filter(a => a.status === "أجازة").length;

  const openPur   = purchases.filter(p => p.status === "مفتوح").length;
  const donePur   = purchases.filter(p => p.status === "تم التوريد").length;
  const latePur   = purchases.filter(p => p.supply_date && p.supply_date < today && p.status === "مفتوح");
  const totalPur  = purchases.length;

  const doneThisMonth = wos.filter(w =>
    w.completion_date && w.completion_date.startsWith(thisMonth)).length;
  const remaining = wos.filter(w => !["مكتمل","تم التسليم"].includes(w.status)).length;

  /* ── Monthly Expected Breakdown ── */
  const monthlyStats = useMemo(() => {
    const stats: Record<string, number> = { "لم يبدأ": 0, "جاري": 0, "متوقف": 0, "مكتمل": 0, "تم التسليم": 0 };
    expectedDeliveries.forEach(wo => {
      const st = wo.status || "لم يبدأ";
      stats[st] = (stats[st] || 0) + 1;
    });
    return stats;
  }, [expectedDeliveries]);

  /* ── WO by status ── */
  const byStatus = useMemo(() =>
    STATUSES.map(st => ({
      status: st,
      list: wos.filter(w => w.status === st),
    })), [wos]);

  /* ── Alerts ── */
  const alerts: { text:string; color:string }[] = [];
  if (lateWOs > 0) alerts.push({ text:`⚠️ ${lateWOs} أمر شغل متأخر عن موعد التسليم`, color:"text-danger" });
  const stopped = wos.filter(w => w.status === "متوقف").length;
  if (stopped > 0) alerts.push({ text:`⛔ ${stopped} أمر شغل متوقف`, color:"text-warning" });
  if (latePur.length > 0) alerts.push({ text:`📦 ${latePur.length} طلب شراء متأخر`, color:"text-warning" });
  if (absentToday.length > 2) alerts.push({ text:`👤 ${absentToday.length} غائبين اليوم`, color:"text-danger" });
  if (violations.length > 3) alerts.push({ text:`🚫 ${violations.length} مخالفة هذا الشهر`, color:"text-warning" });
  if (alerts.length === 0) alerts.push({ text:"✅ لا توجد تنبيهات حرجة", color:"text-success" });

  const open = (type:string, data?:unknown[]) => setModal({ type, data });
  const close = () => setModal(null);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-text">لوحة التحكم</h1>
        <p className="text-sm text-subtext mt-0.5">{today}</p>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        <KpiCard label="إجمالي أوامر الشغل" value={totalWOs}  color="text-accent"  onClick={() => open("all-wos", wos)} />
        <KpiCard label="جاري التنفيذ"       value={activeWOs} color="text-accent2" onClick={() => open("wo-status", wos.filter(w=>w.status==="جاري"))} />
        <KpiCard label="مكتملة"              value={doneWOs}   color="text-success" onClick={() => open("wo-status", wos.filter(w=>w.status==="مكتمل"))} />
        <KpiCard label="متأخرة"              value={lateWOs}   color="text-danger"  onClick={() => open("late-wos", lateWOList)} />
        <KpiCard label="حاضرون اليوم"        value={presentToday} color="text-success" onClick={() => open("present", attendance.filter(a=>a.status==="حاضر"))} />
        <KpiCard label="غائبون اليوم"        value={absentToday.length} color="text-warning" onClick={() => open("absent", absentToday)} />
        <KpiCard label="طلبات شراء مفتوحة"  value={openPur}   color="text-warning" onClick={() => open("open-pur", purchases.filter(p=>p.status==="مفتوح"))} />
      </div>

      {/* ── المطلوب تسليمه هذا الشهر (السكشن الجديد) ── */}
      <section className="eg-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-text text-lg">📅 المطلوب تسليمه هذا الشهر</h2>
            <p className="text-xs text-subtext mt-0.5">إجمالي الأوامر المستهدفة للتسليم خلال الشهر الحالي</p>
          </div>
          <button 
            onClick={() => open("wo-status", expectedDeliveries)}
            className="text-xs text-accent hover:underline font-medium">
            عرض الكل ({expectedDeliveries.length})
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {STATUSES.map(st => {
            const count = monthlyStats[st] || 0;
            return (
              <button key={st}
                onClick={() => open("wo-status", expectedDeliveries.filter(w => (w.status || "لم يبدأ") === st))}
                className="bg-card2 rounded-xl p-4 text-center border border-border/50
                           hover:border-accent/40 transition-all cursor-pointer group">
                <div className="text-xl mb-1">{STATUS_ICONS[st]}</div>
                <div className="text-xl font-bold text-text group-hover:text-accent transition-colors">
                  {count}
                </div>
                <div className="text-xs text-subtext mt-1">{st}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── WO Status Breakdown ── */}
      <section className="eg-card">
        <h2 className="font-bold text-text mb-4">📋 توزيع أوامر الشغل العام — اضغط على أي تصنيف للتفاصيل</h2>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {byStatus.map(({ status, list }) => (
            <button key={status}
              onClick={() => open("wo-status", list)}
              className="bg-card2 rounded-xl p-4 text-center border border-border/50
                         hover:border-accent/40 transition-all cursor-pointer group">
              <div className="text-2xl mb-1">{STATUS_ICONS[status]}</div>
              <div className="text-2xl font-bold text-text group-hover:text-accent transition-colors">
                {list.length}
              </div>
              <div className="text-xs text-subtext mt-1">{status}</div>
              <div className="text-xs text-subtext/60">
                {totalWOs ? Math.round(list.length/totalWOs*100) : 0}%
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Progress + Labour ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Progress */}
        <div className="eg-card">
          <h2 className="font-bold text-text mb-4">📈 متابعة الإنجاز</h2>
          <div className="space-y-3">
            {[
              { label:"مكتملة هذا الشهر", value:doneThisMonth, color:"text-success", items: wos.filter(w=>w.completion_date?.startsWith(thisMonth)) },
              { label:"متبقية", value:remaining, color:"text-accent",  items: wos.filter(w=>!["مكتمل","تم التسليم"].includes(w.status)) },
              { label:"متأخرة", value:lateWOs,   color:"text-danger",  items: lateWOList },
            ].map(r => (
              <button key={r.label} onClick={() => open("wo-status", r.items)}
                className="flex items-center justify-between w-full bg-card2 rounded-lg px-4 py-3
                           hover:bg-border/30 transition-all group">
                <span className={`text-xl font-bold ${r.color}`}>{r.value}</span>
                <span className="text-sm text-subtext group-hover:text-text transition-colors">{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Labour */}
        <div className="eg-card">
          <h2 className="font-bold text-text mb-4">👷 متابعة العمالة اليوم</h2>
          <div className="space-y-3">
            {[
              { label:"حاضر",    value:presentToday, color:"text-success", filter:"حاضر" },
              { label:"غائب",    value:absentToday.length, color:"text-danger", filter:"غياب" },
              { label:"مأمورية", value:missionToday, color:"text-accent",  filter:"مأمورية" },
              { label:"إجازة",   value:leaveToday,   color:"text-warning", filter:"أجازة" },
              { label:"جزاءات الشهر", value:violations.length, color:"text-danger", filter:"" },
            ].map(r => (
              <button key={r.label}
                onClick={() => open("att-filter", r.filter
                  ? attendance.filter(a=>a.status===r.filter)
                  : violations)}
                className="flex items-center justify-between w-full bg-card2 rounded-lg px-4 py-3
                           hover:bg-border/30 transition-all group">
                <span className={`text-xl font-bold ${r.color}`}>{r.value}</span>
                <span className="text-sm text-subtext group-hover:text-text transition-colors">{r.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Purchases + Alerts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Purchases */}
        <div className="eg-card">
          <h2 className="font-bold text-text mb-4">🛒 طلبات الشراء</h2>
          <div className="space-y-3">
            {[
              { label:"إجمالي الطلبات", value:totalPur,       color:"text-accent",  items:purchases },
              { label:"مفتوحة",        value:openPur,        color:"text-warning", items:purchases.filter(p=>p.status==="مفتوح") },
              { label:"تم التوريد",    value:donePur,        color:"text-success", items:purchases.filter(p=>p.status==="تم التوريد") },
              { label:"متأخرة",        value:latePur.length, color:"text-danger",  items:latePur },
            ].map(r => (
              <button key={r.label} onClick={() => open("purchases", r.items)}
                className="flex items-center justify-between w-full bg-card2 rounded-lg px-4 py-3
                           hover:bg-border/30 transition-all group">
                <span className={`text-xl font-bold ${r.color}`}>{r.value}</span>
                <span className="text-sm text-subtext group-hover:text-text transition-colors">{r.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Alerts */}
        <div className="eg-card">
          <h2 className="font-bold text-text mb-4">🔔 لوحة التنبيهات</h2>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className="bg-card2 rounded-lg px-4 py-3">
                <p className={`text-sm font-medium ${a.color}`}>{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <Modal open={!!modal && ["all-wos","wo-status","late-wos"].includes(modal.type)}
        onClose={close} title="أوامر الشغل" size="lg">
        <div className="overflow-x-auto">
          <table className="eg-table">
            <thead><tr><th>رقم الأمر</th><th>الحالة</th><th>التسليم المتوقع</th><th>الإتمام</th></tr></thead>
            <tbody>
              {((modal?.data ?? []) as WorkOrder[]).map((w:WorkOrder) => (
                <tr key={w.id}>
                  <td className="font-mono text-accent">{w.wo_number}</td>
                  <td><Badge label={w.status} /></td>
                  <td>{w.expected_delivery ?? "—"}</td>
                  <td>{w.completion_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(modal?.data?.length ?? 0) === 0 && <EmptyState />}
        </div>
      </Modal>

      <Modal open={!!modal && ["present","absent","att-filter"].includes(modal.type)}
        onClose={close} title="تفاصيل الحضور">
        <div className="space-y-2">
          {((modal?.data ?? []) as (Attendance & {technician?:{name:string;route:string};})[]).map((a,i) => (
            <div key={i} className="flex items-center justify-between bg-card2 rounded-lg px-4 py-3">
              <Badge label={a.status} />
              <span className="text-sm text-text">{a.technician?.name ?? "—"}</span>
            </div>
          ))}
          {(modal?.data?.length ?? 0) === 0 && <EmptyState />}
        </div>
      </Modal>

      <Modal open={!!modal && modal.type === "purchases"} onClose={close} title="طلبات الشراء" size="lg">
        <div className="overflow-x-auto">
          <table className="eg-table">
            <thead><tr><th>الصنف</th><th>أمر الشغل</th><th>الكمية</th><th>التوريد</th><th>الحالة</th></tr></thead>
            <tbody>
              {((modal?.data ?? []) as (Purchase & {work_order?:{wo_number:string}})[]).map((p,i) => (
                <tr key={i}>
                  <td>{p.item_name}</td>
                  <td className="font-mono text-accent">{p.work_order?.wo_number ?? "—"}</td>
                  <td>{p.qty}</td>
                  <td>{p.supply_date ?? "—"}</td>
                  <td><Badge label={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {(modal?.data?.length ?? 0) === 0 && <EmptyState />}
        </div>
      </Modal>
    </div>
  );
}