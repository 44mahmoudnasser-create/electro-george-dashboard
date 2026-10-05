"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Technician } from "@/types";
import { today } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import { Save, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

const ATT_OPTS = ["حاضر","غياب","أجازة","مأمورية"];
const PERM_OPTS = ["—","إذن ساعتين صباحي","إذن ساعتين مسائي","إذن نصف يوم صباحي","إذن نصف يوم مسائي"];

type AttRow = { tech_id:number; status:string; permission:string; overtime:boolean };
type YearAttRow = { tech_id:number; date:string; status:string };

export default function AttendanceClient({
  initialTechnicians, role, department, isManager, departments, initialYearAttendance,
}: {
  initialTechnicians: Technician[];
  role: string;
  department: string | null;
  isManager: boolean;
  departments: string[];
  initialYearAttendance: YearAttRow[];
}) {
  const [date, setDate] = useState(today());
  const [selectedDept, setSelectedDept] = useState<string>(isManager ? "الكل" : (department ?? ""));
  const [rows, setRows] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [yearAttendance, setYearAttendance] = useState<YearAttRow[]>(initialYearAttendance);
  const [statsMonth, setStatsMonth] = useState(today().slice(0, 7)); // "YYYY-MM"
  const [expandedTech, setExpandedTech] = useState<number | null>(null);

  // الفنيين المفلترين حسب القسم المختار (لو manager)
  const visibleTechnicians = useMemo(() => {
    if (!isManager || selectedDept === "الكل") return initialTechnicians;
    return initialTechnicians.filter(t => t.department === selectedDept);
  }, [initialTechnicians, selectedDept, isManager]);

  const visibleTechIds = useMemo(() => new Set(visibleTechnicians.map(t => t.id)), [visibleTechnicians]);

  const load = async () => {
    setLoading(true);
    const techIds = visibleTechnicians.map(t => t.id);

    if (techIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const [att, perm, ot] = await Promise.all([
      supabase.from("attendance").select("tech_id,status").eq("date", date).in("tech_id", techIds),
      supabase.from("permissions").select("tech_id,permission_type").eq("date", date).in("tech_id", techIds),
      supabase.from("overtime").select("tech_id,has_overtime").eq("date", date).in("tech_id", techIds),
    ]);
    const attMap = Object.fromEntries((att.data ?? []).map(r => [r.tech_id, r.status]));
    const permMap = Object.fromEntries((perm.data ?? []).map(r => [r.tech_id, r.permission_type]));
    const otMap = Object.fromEntries((ot.data ?? []).map(r => [r.tech_id, r.has_overtime]));
    setRows(visibleTechnicians.map(t => ({
      tech_id: t.id,
      status: attMap[t.id] ?? "حاضر",
      permission: permMap[t.id] ?? "—",
      overtime: otMap[t.id] ?? false,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [date, selectedDept]);

  const setRow = (tech_id:number, patch: Partial<AttRow>) => {
    setRows(prev => prev.map(r => r.tech_id === tech_id ? { ...r, ...patch } : r));
  };

  const save = async () => {
    setSaving(true);
    for (const r of rows) {
      await supabase.from("attendance")
        .upsert({ tech_id: r.tech_id, date, status: r.status }, { onConflict: "tech_id,date" });
      if (r.permission !== "—") {
        await supabase.from("permissions")
          .upsert({ tech_id: r.tech_id, date, permission_type: r.permission }, { onConflict: "tech_id,date" });
      } else {
        await supabase.from("permissions").delete().eq("tech_id", r.tech_id).eq("date", date);
      }
      await supabase.from("overtime")
        .upsert({ tech_id: r.tech_id, date, has_overtime: r.overtime }, { onConflict: "tech_id,date" });
    }
    setSaving(false);

    // حدّث إحصائيات السنة محليًا فورًا من غير إعادة تحميل الصفحة
    if (date.slice(0, 4) === today().slice(0, 4)) {
      setYearAttendance(prev => {
        const next = [...prev];
        rows.forEach(r => {
          const idx = next.findIndex(y => y.tech_id === r.tech_id && y.date === date);
          if (idx >= 0) next[idx] = { ...next[idx], status: r.status };
          else next.push({ tech_id: r.tech_id, date, status: r.status });
        });
        return next;
      });
    }

    fetch("/api/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "📅 تسجيل حضور جديد",
        body: `تم تسجيل الحضور بتاريخ ${date}`,
        url: "/attendance",
      }),
    }).catch(() => {});

    alert("✅ تم الحفظ بنجاح");
  };

  // ---------- إحصائيات الشهر والسنة ----------
  const yearStr = today().slice(0, 4);

  const visibleYearRecords = useMemo(
    () => yearAttendance.filter(r => visibleTechIds.has(r.tech_id)),
    [yearAttendance, visibleTechIds]
  );

  const monthRecords = useMemo(
    () => visibleYearRecords.filter(r => r.date.startsWith(statsMonth)),
    [visibleYearRecords, statsMonth]
  );

  const countByStatus = (records: YearAttRow[], status: string) =>
    records.filter(r => r.status === status).length;

  const monthStats = {
    "حاضر": countByStatus(monthRecords, "حاضر"),
    "غياب": countByStatus(monthRecords, "غياب"),
    "أجازة": countByStatus(monthRecords, "أجازة"),
    "مأمورية": countByStatus(monthRecords, "مأمورية"),
  };
  const yearAbsent = countByStatus(visibleYearRecords, "غياب");
  const yearLeave = countByStatus(visibleYearRecords, "أجازة");

  // تفصيل شهري لكل فني
  const perTechMonthly = useMemo(() => {
    return visibleTechnicians.map(t => {
      const recs = monthRecords.filter(r => r.tech_id === t.id);
      return {
        tech: t,
        present: countByStatus(recs, "حاضر"),
        absent: countByStatus(recs, "غياب"),
        leave: countByStatus(recs, "أجازة"),
        mission: countByStatus(recs, "مأمورية"),
        records: recs.slice().sort((a, b) => b.date.localeCompare(a.date)),
      };
    }).sort((a, b) => b.absent - a.absent); // الأكتر غيابًا فوق، لسهولة المتابعة
  }, [visibleTechnicians, monthRecords]);

  const monthLabel = useMemo(() => {
    const [y, m] = statsMonth.split("-").map(Number);
    if (!y || !m) return statsMonth;
    return new Date(y, m - 1, 1).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
  }, [statsMonth]);

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* ── تسجيل الحضور اليومي ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text">📅 الحضور والإذونات</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {isManager && (
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="eg-select w-40"
            >
              <option value="الكل">كل الأقسام</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="eg-input w-44" />
          <button onClick={load} className="eg-btn-ghost" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={save} disabled={saving} className="eg-btn-success">
            <Save className="w-4 h-4" />{saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>

      <div className="eg-card overflow-x-auto">
        <table className="eg-table">
          <thead><tr>
            <th>الاسم</th><th>الحضور</th><th>الإذن</th><th>عمل إضافي</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const tech = visibleTechnicians.find(t => t.id === r.tech_id);
              if (!tech) return null;
              return (
                <tr key={r.tech_id}>
                  <td className="font-medium text-text">{tech.name}</td>
                  <td>
                    <select value={r.status} onChange={e => setRow(r.tech_id, { status: e.target.value })}
                      className="eg-select w-36 text-sm">
                      {ATT_OPTS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={r.permission} onChange={e => setRow(r.tech_id, { permission: e.target.value })}
                      className="eg-select w-48 text-sm">
                      {PERM_OPTS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="text-center">
                    <input type="checkbox" checked={r.overtime}
                      onChange={e => setRow(r.tech_id, { overtime: e.target.checked })}
                      className="w-5 h-5 accent-emerald-500 cursor-pointer" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && !loading && (
          <p className="text-center py-10 text-subtext text-sm">لا يوجد فنيين — أضف الفنيين أولاً</p>
        )}
      </div>

      {/* ── لوحة إحصائيات الحضور ── */}
      <div className="eg-card space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-bold text-text">📊 إحصائيات الحضور</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-subtext whitespace-nowrap">الشهر:</label>
            <input type="month" value={statsMonth} onChange={e => setStatsMonth(e.target.value)}
              className="eg-input !w-auto" />
          </div>
        </div>

        {/* كروت سريعة */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card2 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-danger">{monthStats["غياب"]}</div>
            <div className="text-xs text-subtext mt-1">غياب {monthLabel}</div>
          </div>
          <div className="bg-card2 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-danger">{yearAbsent}</div>
            <div className="text-xs text-subtext mt-1">غياب سنة {yearStr}</div>
          </div>
          <div className="bg-card2 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-warning">{monthStats["أجازة"]}</div>
            <div className="text-xs text-subtext mt-1">إجازات {monthLabel}</div>
          </div>
          <div className="bg-card2 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-accent">{monthStats["مأمورية"]}</div>
            <div className="text-xs text-subtext mt-1">مأموريات {monthLabel}</div>
          </div>
        </div>

        {/* تفصيل شهري لكل فني */}
        <div className="overflow-x-auto">
          <table className="eg-table">
            <thead><tr>
              <th>الاسم</th><th>حاضر</th><th>غياب</th><th>إجازة</th><th>مأمورية</th><th></th>
            </tr></thead>
            <tbody>
              {perTechMonthly.map(({ tech, present, absent, leave, mission, records }) => (
                <>
                  <tr key={tech.id}
                    onClick={() => setExpandedTech(expandedTech === tech.id ? null : tech.id)}
                    className="cursor-pointer hover:bg-card2/60">
                    <td className="font-medium text-text">{tech.name}</td>
                    <td className="text-success">{present}</td>
                    <td className={absent > 0 ? "text-danger font-bold" : "text-subtext"}>{absent}</td>
                    <td className="text-warning">{leave}</td>
                    <td className="text-accent">{mission}</td>
                    <td className="text-subtext">
                      {expandedTech === tech.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </td>
                  </tr>
                  {expandedTech === tech.id && (
                    <tr>
                      <td colSpan={6} className="bg-card2/40 p-0">
                        {records.length === 0 ? (
                          <p className="text-center py-4 text-subtext text-xs">لا توجد سجلات هذا الشهر</p>
                        ) : (
                          <div className="p-3 flex flex-wrap gap-2">
                            {records.map((r, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-xs bg-card rounded-full px-2 py-1">
                                <span className="text-subtext">{r.date}</span>
                                <Badge label={r.status} />
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          {perTechMonthly.length === 0 && (
            <p className="text-center py-6 text-subtext text-sm">لا يوجد فنيين لعرض إحصائياتهم</p>
          )}
        </div>
      </div>
    </div>
  );
}
