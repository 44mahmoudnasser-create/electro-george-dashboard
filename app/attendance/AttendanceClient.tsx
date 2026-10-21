"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Technician } from "@/types";
import { today } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import { Save, RefreshCw, ChevronDown, ChevronUp, Printer, CalendarCheck } from "lucide-react";
import { buildOvertimeForm, downloadBlob } from "@/lib/overtime-form";
import { cn } from "@/lib/utils";

const NOT_RECORDED = "—";
const ATT_OPTS = [NOT_RECORDED, "حاضر", "غياب", "أجازة", "مأمورية"];
const PERM_OPTS = ["—", "إذن ساعتين صباحي", "إذن ساعتين مسائي", "إذن نصف يوم صباحي", "إذن نصف يوم مسائي"];

type AttRow = { tech_id: number; status: string; permission: string; overtime: boolean };
type YearAttRow = { tech_id: number; date: string; status: string };
type Tab = "daily" | "stats";

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
  const [tab, setTab] = useState<Tab>("daily");
  const [date, setDate] = useState(today());
  const [selectedDept, setSelectedDept] = useState<string>(isManager ? "الكل" : (department ?? ""));
  const [rows, setRows] = useState<AttRow[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [yearAttendance, setYearAttendance] = useState<YearAttRow[]>(initialYearAttendance);
  const [statsMonth, setStatsMonth] = useState(today().slice(0, 7));
  const [expandedTech, setExpandedTech] = useState<number | null>(null);

  const visibleTechnicians = useMemo(() => {
    if (!isManager || selectedDept === "الكل") return initialTechnicians;
    return initialTechnicians.filter(t => t.department === selectedDept);
  }, [initialTechnicians, selectedDept, isManager]);

  const techById = useMemo(() => new Map(visibleTechnicians.map(t => [t.id, t])), [visibleTechnicians]);
  const visibleTechIds = useMemo(() => new Set(visibleTechnicians.map(t => t.id)), [visibleTechnicians]);

  const dirty = useMemo(() => JSON.stringify(rows) !== savedSnapshot, [rows, savedSnapshot]);

  // رسالة الحالة بتختفي لوحدها
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  /* ─────────── تحميل يوم ─────────── */
  const load = async () => {
    setLoading(true);
    const techIds = visibleTechnicians.map(t => t.id);
    if (techIds.length === 0) {
      setRows([]); setSavedSnapshot("[]"); setLoading(false);
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
    const next = visibleTechnicians.map(t => ({
      tech_id: t.id,
      status: attMap[t.id] ?? NOT_RECORDED,
      permission: permMap[t.id] ?? "—",
      overtime: otMap[t.id] ?? false,
    }));
    setRows(next);
    setSavedSnapshot(JSON.stringify(next));
    setLoading(false);
  };

  useEffect(() => { load(); }, [date, selectedDept]);

  // لو فيه تعديلات مش محفوظة، نسأل قبل ما نغيّر اليوم أو القسم علشان ماتضيعش
  const confirmDiscard = () =>
    !dirty || window.confirm("فيه تغييرات مش محفوظة. تتجاهل وتكمل؟");

  const changeDate = (value: string) => {
    if (value === date || !confirmDiscard()) return;
    setDate(value);
  };

  const changeDept = (value: string) => {
    if (value === selectedDept || !confirmDiscard()) return;
    setSelectedDept(value);
  };

  const setRow = (tech_id: number, patch: Partial<AttRow>) =>
    setRows(prev => prev.map(r => r.tech_id === tech_id ? { ...r, ...patch } : r));

  /* ─────────── حفظ: بيبعت بس الصفوف اللي اتغيرت، في طلبات مجمعة ─────────── */
  const save = async () => {
    const saved = new Map<number, AttRow>(
      (JSON.parse(savedSnapshot || "[]") as AttRow[]).map(r => [r.tech_id, r])
    );
    const changed = rows.filter(r => {
      const s = saved.get(r.tech_id);
      return !s || s.status !== r.status || s.permission !== r.permission || s.overtime !== r.overtime;
    });
    if (changed.length === 0) {
      setNotice({ ok: true, text: "مفيش تغييرات تتحفظ" });
      return;
    }

    setSaving(true);
    try {
      const attRows = changed
        .filter(r => r.status !== NOT_RECORDED)
        .map(r => ({ tech_id: r.tech_id, date, status: r.status }));
      const attDeleteIds = changed
        .filter(r => r.status === NOT_RECORDED && saved.get(r.tech_id)?.status !== NOT_RECORDED)
        .map(r => r.tech_id);
      const otRows = changed.map(r => ({ tech_id: r.tech_id, date, has_overtime: r.overtime }));
      const permUpserts = changed
        .filter(r => r.permission !== "—")
        .map(r => ({ tech_id: r.tech_id, date, permission_type: r.permission }));
      // نحذف الإذن بس للي كان عنده إذن قبل كده وبقى "—"
      const permDeleteIds = changed
        .filter(r => r.permission === "—" && saved.get(r.tech_id)?.permission !== "—")
        .map(r => r.tech_id);

      const ops: PromiseLike<{ error: { message: string } | null }>[] = [
        supabase.from("overtime").upsert(otRows, { onConflict: "tech_id,date" }),
      ];
      if (attRows.length) {
        ops.push(supabase.from("attendance").upsert(attRows, { onConflict: "tech_id,date" }));
      }
      if (attDeleteIds.length) {
        ops.push(supabase.from("attendance").delete().in("tech_id", attDeleteIds).eq("date", date));
      }
      if (permUpserts.length) {
        ops.push(supabase.from("permissions").upsert(permUpserts, { onConflict: "tech_id,date" }));
      }
      if (permDeleteIds.length) {
        ops.push(supabase.from("permissions").delete().in("tech_id", permDeleteIds).eq("date", date));
      }

      const results = await Promise.all(ops);
      const failed = results.find(r => r.error);
      if (failed?.error) throw new Error(failed.error.message);
    } catch (e) {
      setSaving(false);
      setNotice({ ok: false, text: (e as Error).message || "حصل خطأ أثناء الحفظ" });
      return;
    }
    setSaving(false);
    setSavedSnapshot(JSON.stringify(rows));

    if (date.slice(0, 4) === today().slice(0, 4)) {
      setYearAttendance(prev => {
        const next = [...prev];
        changed.forEach(r => {
          const idx = next.findIndex(y => y.tech_id === r.tech_id && y.date === date);
          if (r.status === NOT_RECORDED) {
            if (idx >= 0) next.splice(idx, 1);
          } else if (idx >= 0) next[idx] = { ...next[idx], status: r.status };
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

    setNotice({ ok: true, text: `تم الحفظ (${changed.length} ${changed.length === 1 ? "فني" : "فنيين"})` });
  };

  /* ─────────── كشف العمل الإضافي ─────────── */
  const printOvertimeForm = async () => {
    const techIds = visibleTechnicians.map(t => t.id);
    if (techIds.length === 0) return;
    setPrinting(true);
    const { data, error } = await supabase.from("overtime")
      .select("tech_id").eq("date", date).eq("has_overtime", true).in("tech_id", techIds);
    if (error) { setPrinting(false); setNotice({ ok: false, text: error.message }); return; }
    const otIds = new Set((data ?? []).map(r => r.tech_id));
    const people = visibleTechnicians
      .filter(t => otIds.has(t.id))
      .map(t => ({ name: t.name, route: t.route ?? null, dept: t.department ?? null }));
    if (people.length === 0) {
      setPrinting(false);
      setNotice({ ok: false, text: "مفيش عمل إضافي محفوظ في التاريخ ده" });
      return;
    }
    try {
      const blob = await buildOvertimeForm(date, people);
      downloadBlob(blob, `كشف_عمل_إضافي_${date}.docx`);
    } catch (e) {
      setNotice({ ok: false, text: (e as Error).message });
    }
    setPrinting(false);
  };

  /* ─────────── ملخص اليوم ─────────── */
  const daySummary = useMemo(() => {
    const c = (fn: (r: AttRow) => boolean) => rows.filter(fn).length;
    return {
      unrecorded: c(r => r.status === NOT_RECORDED),
      present: c(r => r.status === "حاضر"),
      absent: c(r => r.status === "غياب"),
      leave: c(r => r.status === "أجازة"),
      mission: c(r => r.status === "مأمورية"),
      permission: c(r => r.permission !== "—"),
      overtime: c(r => r.overtime),
    };
  }, [rows]);

  /* ─────────── الإحصائيات ─────────── */
  const yearStr = today().slice(0, 4);
  const visibleYearRecords = useMemo(
    () => yearAttendance.filter(r => visibleTechIds.has(r.tech_id)),
    [yearAttendance, visibleTechIds]
  );
  const monthRecords = useMemo(
    () => visibleYearRecords.filter(r => r.date.startsWith(statsMonth)),
    [visibleYearRecords, statsMonth]
  );
  const count = (records: YearAttRow[], status: string) => records.filter(r => r.status === status).length;

  const monthTotals = {
    absent: count(monthRecords, "غياب"),
    leave: count(monthRecords, "أجازة"),
    mission: count(monthRecords, "مأمورية"),
  };
  const yearAbsent = count(visibleYearRecords, "غياب");

  const perTechMonthly = useMemo(() => visibleTechnicians.map(t => {
    const recs = monthRecords.filter(r => r.tech_id === t.id);
    return {
      tech: t,
      present: count(recs, "حاضر"),
      absent: count(recs, "غياب"),
      leave: count(recs, "أجازة"),
      mission: count(recs, "مأمورية"),
      records: recs.slice().sort((a, b) => b.date.localeCompare(a.date)),
    };
  }).sort((a, b) => b.absent - a.absent), [visibleTechnicians, monthRecords]);

  const monthLabel = useMemo(() => {
    const [y, m] = statsMonth.split("-").map(Number);
    if (!y || !m) return statsMonth;
    return new Date(y, m - 1, 1).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
  }, [statsMonth]);

  /* ═══════════════════════ العرض ═══════════════════════ */
  return (
    <div className="max-w-6xl mx-auto">
      {/* شريط علوي ثابت */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border/60 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <CalendarCheck className="w-5 h-5 text-accent" />
            <h1 className="text-lg font-bold text-text">الحضور والإذونات</h1>
            {tab === "daily" && dirty && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning/15 text-warning">تغييرات غير محفوظة</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {tab === "daily" && (
              <>
                <input type="date" value={date} onChange={e => changeDate(e.target.value)}
                  className="eg-input !py-1.5 !text-xs w-36" />
                <IconBtn onClick={load} disabled={loading} title="تحديث">
                  <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                </IconBtn>
                <button onClick={printOvertimeForm} disabled={printing}
                  className="eg-btn-ghost !py-1.5 !text-xs" title="كشف العمل الإضافي للمتسجلين في التاريخ ده">
                  <Printer className="w-3.5 h-3.5" />{printing ? "..." : "كشف عمل إضافي"}
                </button>
                <button onClick={save} disabled={saving || !dirty || rows.length === 0}
                  className="eg-btn-success !py-1.5 !text-xs disabled:opacity-40">
                  <Save className="w-3.5 h-3.5" />{saving ? "جاري الحفظ..." : "حفظ"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* التبويبات */}
        <div className="flex gap-1 mt-3">
          {([["daily", "تسجيل اليوم"], ["stats", "الإحصائيات"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={cn("px-3 py-1.5 text-xs rounded-md transition-colors",
                tab === k ? "bg-accent/15 text-accent font-semibold" : "text-subtext hover:text-text")}>
              {label}
            </button>
          ))}
        </div>

        {/* فلتر الأقسام (للمدير بس) */}
        {isManager && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {["الكل", ...departments].map(d => {
              const active = selectedDept === d;
              return (
                <button key={d} onClick={() => changeDept(d)}
                  className={cn("px-2.5 py-1 text-[11px] rounded-full border transition-colors",
                    active ? "bg-accent/15 border-accent/60 text-accent font-semibold"
                           : "bg-card2 border-border text-subtext hover:text-text")}>
                  {d === "الكل" ? "كل الأقسام" : d}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {notice && (
          <div className={cn("text-xs px-3 py-2 rounded-lg border",
            notice.ok ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger")}>
            {notice.text}
          </div>
        )}

        {tab === "daily" ? (
          <>
            {/* ملخص اليوم */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <Stat label="لم يُسجل" value={daySummary.unrecorded} tone="muted" />
              <Stat label="حاضر" value={daySummary.present} tone="success" />
              <Stat label="غياب" value={daySummary.absent} tone="danger" />
              <Stat label="إجازة" value={daySummary.leave} tone="warning" />
              <Stat label="مأمورية" value={daySummary.mission} tone="accent" />
              <Stat label="إذن" value={daySummary.permission} tone="muted" />
              <Stat label="عمل إضافي" value={daySummary.overtime} tone="muted" />
            </div>

            {/* جدول اليوم */}
            <div className="eg-card !p-0 overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-card2 text-subtext text-xs">
                    <th className="px-4 py-2 text-right font-semibold">الاسم</th>
                    <th className="px-3 py-2 text-right font-semibold w-44">الحضور</th>
                    <th className="px-3 py-2 text-right font-semibold w-56">الإذن</th>
                    <th className="px-3 py-2 text-center font-semibold w-24">عمل إضافي</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const tech = techById.get(r.tech_id);
                    if (!tech) return null;
                    const isAbsent = r.status === "غياب";
                    return (
                      <tr key={r.tech_id}
                        className={cn("border-t border-border/40 hover:bg-card2/50", isAbsent && "bg-danger/5")}>
                        <td className="px-4 py-2">
                          <div className="font-medium text-text">{tech.name}</div>
                          {(tech.route || tech.department) && (
                            <div className="text-[11px] text-subtext">{[tech.department, tech.route].filter(Boolean).join(" · ")}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select value={r.status} onChange={e => setRow(r.tech_id, { status: e.target.value })}
                            className={cn("eg-select !py-1 !text-xs w-full",
                              isAbsent && "!border-danger/50 !text-danger")}>
                            {ATT_OPTS.map(o => <option key={o} value={o}>{o === NOT_RECORDED ? "لم يُسجل" : o}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select value={r.permission} onChange={e => setRow(r.tech_id, { permission: e.target.value })}
                            className="eg-select !py-1 !text-xs w-full">
                            {PERM_OPTS.map(o => <option key={o}>{o}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input type="checkbox" checked={r.overtime}
                            onChange={e => setRow(r.tech_id, { overtime: e.target.checked })}
                            className="w-4 h-4 accent-emerald-500 cursor-pointer align-middle" />
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
          </>
        ) : (
          <>
            {/* شريط الشهر */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-sm font-bold text-text">إحصائيات {monthLabel}</h2>
              <input type="month" value={statsMonth} onChange={e => setStatsMonth(e.target.value)}
                className="eg-input !py-1.5 !text-xs w-40" />
            </div>

            {/* كروت مختصرة */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiTile label={`غياب ${monthLabel}`} value={monthTotals.absent} tone="danger" />
              <KpiTile label={`غياب سنة ${yearStr}`} value={yearAbsent} tone="danger" />
              <KpiTile label={`إجازات ${monthLabel}`} value={monthTotals.leave} tone="warning" />
              <KpiTile label={`مأموريات ${monthLabel}`} value={monthTotals.mission} tone="accent" />
            </div>

            {/* تفصيل لكل فني */}
            <div className="eg-card !p-0 overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-card2 text-subtext text-xs">
                    <th className="px-4 py-2 text-right font-semibold">الاسم</th>
                    <th className="px-3 py-2 text-center font-semibold w-20">حاضر</th>
                    <th className="px-3 py-2 text-center font-semibold w-20">غياب</th>
                    <th className="px-3 py-2 text-center font-semibold w-20">إجازة</th>
                    <th className="px-3 py-2 text-center font-semibold w-20">مأمورية</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {perTechMonthly.map(({ tech, present, absent, leave, mission, records }) => {
                    const open = expandedTech === tech.id;
                    return (
                      <Fragment key={tech.id}>
                        <tr onClick={() => setExpandedTech(open ? null : tech.id)}
                          className="border-t border-border/40 cursor-pointer hover:bg-card2/50">
                          <td className="px-4 py-2 font-medium text-text">{tech.name}</td>
                          <td className="px-3 py-2 text-center text-success">{present}</td>
                          <td className={cn("px-3 py-2 text-center", absent > 0 ? "text-danger font-bold" : "text-subtext")}>{absent}</td>
                          <td className="px-3 py-2 text-center text-warning">{leave}</td>
                          <td className="px-3 py-2 text-center text-accent">{mission}</td>
                          <td className="px-3 py-2 text-subtext">
                            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </td>
                        </tr>
                        {open && (
                          <tr className="border-t border-border/40 bg-card2/30">
                            <td colSpan={6} className="px-4 py-3">
                              {records.length === 0 ? (
                                <p className="text-xs text-subtext">لا توجد سجلات هذا الشهر</p>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {records.map((r, i) => (
                                    <span key={i} className="inline-flex items-center gap-1.5 text-[11px] bg-card rounded-md px-2 py-1 border border-border/50">
                                      <span className="text-subtext tabular-nums">{r.date}</span>
                                      <Badge label={r.status} />
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {perTechMonthly.length === 0 && (
                <p className="text-center py-8 text-subtext text-sm">لا يوجد فنيين لعرض إحصائياتهم</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════ مكونات صغيرة ═══════════════════════ */

const TONES: Record<string, string> = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  accent: "text-accent",
  muted: "text-subtext",
};

function Stat({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONES }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-card2 rounded-md px-2.5 py-1 border border-border/50">
      <span className="text-subtext">{label}</span>
      <span className={cn("font-bold tabular-nums", TONES[tone])}>{value}</span>
    </span>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number; tone: keyof typeof TONES }) {
  return (
    <div className="eg-card !p-3">
      <div className={cn("text-xl font-bold tabular-nums", TONES[tone])}>{value}</div>
      <div className="text-[11px] text-subtext mt-0.5">{label}</div>
    </div>
  );
}

function IconBtn({ children, onClick, disabled, title }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className="p-1.5 rounded-md border border-border bg-card2 text-subtext hover:text-text disabled:opacity-50">
      {children}
    </button>
  );
}
