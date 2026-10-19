"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";
import { ChevronRight, Pencil, Trash2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const GRADES = ["فني", "مشرف", "مساعد"] as const;
const STATUS_COLORS = {
  present: "#10b981",
  absent: "#ef4444",
  leave: "#f59e0b",
  mission: "#3b82f6",
};

type Tab = "overview" | "att" | "perm" | "ot" | "viol" | "prod" | "files" | "info";
type Bucket = {
  key: string; label: string;
  present: number; absent: number; leave: number; mission: number;
  permissions: number; overtime: number; violations: number; productivity: number;
  rate: number | null;
};

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("ar-EG", { month: "short", year: "numeric" });
};

export default function TechDetailClient({
  tech, allSkills, techSkills, attendance, permissions, overtime, violations, productivity, filesReceived, role,
}: {
  tech: any; allSkills: any[]; techSkills: { skill_id: number; skill_name?: string }[];
  attendance: { date: string; status: string }[];
  permissions: { date: string; permission_type: string }[];
  overtime: { date: string; has_overtime: boolean }[];
  violations: { date: string; reason: string; details: string }[];
  productivity: any[];
  filesReceived: any[];
  role: string;
}) {
  const router = useRouter();

  /* ─────────── السنوات المتاحة ─────────── */
  const years = useMemo(() => {
    const set = new Set<string>();
    attendance.forEach(a => set.add(a.date.slice(0, 4)));
    permissions.forEach(p => set.add(p.date.slice(0, 4)));
    overtime.forEach(o => set.add(o.date.slice(0, 4)));
    violations.forEach(v => v.date && set.add(v.date.slice(0, 4)));
    productivity.forEach(p => p.work_date && set.add(p.work_date.slice(0, 4)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [attendance, permissions, overtime, violations, productivity]);

  const currentYear = new Date().getFullYear().toString();
  const [year, setYear] = useState<string>(years.includes(currentYear) ? currentYear : (years[0] ?? "all"));
  const [tab, setTab] = useState<Tab>("overview");
  const [statusFilter, setStatusFilter] = useState("الكل");

  const [editOpen, setEditOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const [form, setForm] = useState({
    name: tech.name as string,
    grade: (tech.grade ?? "فني") as string,
    route: (tech.route ?? "") as string,
    skill_ids: techSkills.map(ts => ts.skill_id),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  /* ─────────── فلترة بالسنة ─────────── */
  const inYear = (d?: string | null) => year === "all" || (!!d && d.startsWith(year));
  const attY = useMemo(() => attendance.filter(a => inYear(a.date)), [attendance, year]);
  const permY = useMemo(() => permissions.filter(p => inYear(p.date)), [permissions, year]);
  const otY = useMemo(() => overtime.filter(o => inYear(o.date)), [overtime, year]);
  const violY = useMemo(() => violations.filter(v => inYear(v.date)), [violations, year]);
  const prodY = useMemo(() => productivity.filter(p => inYear(p.work_date)), [productivity, year]);
  const filesY = useMemo(() => filesReceived.filter(f => inYear(f.delivery_date)), [filesReceived, year]);

  /* ─────────── الإحصائيات ─────────── */
  const totals = useMemo(() => {
    const c = (s: string) => attY.filter(a => a.status === s).length;
    const present = c("حاضر"), absent = c("غياب"), leave = c("أجازة"), mission = c("مأمورية");
    const recorded = attY.length;
    return {
      recorded, present, absent, leave, mission,
      rate: recorded ? Math.round(((present + mission) / recorded) * 100) : null,
    };
  }, [attY]);

  const permByType = useMemo(() => {
    const m = new Map<string, number>();
    permY.forEach(p => m.set(p.permission_type, (m.get(p.permission_type) ?? 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [permY]);

  // تفصيل شهري (لو سنة محددة) أو سنوي (لو كل السنين)
  const buckets: Bucket[] = useMemo(() => {
    const map = new Map<string, Bucket>();
    const keyOf = (d: string) => (year === "all" ? d.slice(0, 4) : d.slice(0, 7));
    const get = (k: string) => {
      if (!map.has(k)) map.set(k, {
        key: k, label: k, present: 0, absent: 0, leave: 0, mission: 0,
        permissions: 0, overtime: 0, violations: 0, productivity: 0, rate: null,
      });
      return map.get(k)!;
    };
    if (year !== "all") {
      for (let m = 1; m <= 12; m++) get(`${year}-${String(m).padStart(2, "0")}`);
    }
    attY.forEach(a => {
      const b = get(keyOf(a.date));
      if (a.status === "حاضر") b.present++;
      else if (a.status === "غياب") b.absent++;
      else if (a.status === "أجازة") b.leave++;
      else if (a.status === "مأمورية") b.mission++;
    });
    permY.forEach(p => get(keyOf(p.date)).permissions++);
    otY.forEach(o => get(keyOf(o.date)).overtime++);
    violY.forEach(v => v.date && get(keyOf(v.date)).violations++);
    prodY.forEach(p => p.work_date && get(keyOf(p.work_date)).productivity++);

    return Array.from(map.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(b => {
        const tot = b.present + b.absent + b.leave + b.mission;
        return {
          ...b,
          label: year === "all" ? b.key : monthLabel(b.key),
          rate: tot ? Math.round(((b.present + b.mission) / tot) * 100) : null,
        };
      });
  }, [attY, permY, otY, violY, prodY, year]);

  // سجل الحضور مع الإذن والسهر لنفس اليوم
  const permByDate = useMemo(() => new Map(permissions.map(p => [p.date, p.permission_type])), [permissions]);
  const otDates = useMemo(() => new Set(overtime.map(o => o.date)), [overtime]);
  const attList = useMemo(() => attY
    .filter(a => statusFilter === "الكل" || a.status === statusFilter)
    .sort((a, b) => b.date.localeCompare(a.date)), [attY, statusFilter]);

  /* ─────────── تعديل / حذف ─────────── */
  const toggleSkill = (id: number) =>
    setForm(f => ({
      ...f,
      skill_ids: f.skill_ids.includes(id) ? f.skill_ids.filter(x => x !== id) : [...f.skill_ids, id],
    }));

  const saveEdit = async () => {
    setSaving(true); setError("");
    const { error: e1 } = await supabase.from("technicians")
      .update({ name: form.name, grade: form.grade, route: form.route })
      .eq("id", tech.id);
    if (e1) { setSaving(false); setError(e1.message); return; }
    await supabase.from("tech_skills").delete().eq("tech_id", tech.id);
    if (form.skill_ids.length > 0) {
      const { error: e2 } = await supabase.from("tech_skills").insert(
        form.skill_ids.map(skill_id => ({ tech_id: tech.id, skill_id }))
      );
      if (e2) { setSaving(false); setError(e2.message); return; }
    }
    setSaving(false); setEditOpen(false);
    router.refresh();
  };

  const deleteTech = async () => {
    setDeleting(true);
    for (const t of ["tech_skills", "violations", "attendance", "permissions", "overtime", "daily_productivity"]) {
      await supabase.from(t).delete().eq("tech_id", tech.id);
    }
    await supabase.from("files").update({ delivered_to: null }).eq("delivered_to", tech.id);
    await supabase.from("technicians").delete().eq("id", tech.id);
    router.push("/technicians");
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: "نظرة عامة" },
    { key: "att", label: `الحضور (${attY.length})` },
    { key: "perm", label: `الإذونات (${permY.length})` },
    { key: "ot", label: `سهر (${otY.length})` },
    { key: "viol", label: `مخالفات (${violY.length})` },
    { key: "prod", label: `إنتاجية (${prodY.length})` },
    { key: "files", label: `ملفات (${filesY.length})` },
    { key: "info", label: "البيانات" },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {/* ── الهيدر ── */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border/60 px-4 md:px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => router.push("/technicians")} className="eg-btn-ghost !py-1.5 !px-2.5 !text-xs">
            <ChevronRight className="w-3.5 h-3.5" />الفنيين
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-text truncate">{tech.name}</h1>
              <Badge label={tech.grade ?? "فني"} />
            </div>
            <p className="text-xs text-subtext truncate">{tech.route ?? "—"}{tech.department ? ` · ${tech.department}` : ""}</p>
          </div>
          <select value={year} onChange={e => setYear(e.target.value)} className="eg-select !py-1.5 !text-xs w-32">
            <option value="all">كل السنوات</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setEditOpen(true)} className="eg-btn-ghost !py-1.5 !px-2.5" title="تعديل">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setDelConfirm(true)} className="eg-btn-danger !py-1.5 !px-2.5" title="حذف">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto mt-3 pb-1">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn("px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors",
                tab === key ? "bg-accent/15 text-accent font-semibold" : "text-subtext hover:text-text")}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {/* ── KPIs (دايمًا ظاهرين) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <Kpi label="أيام مسجلة" value={totals.recorded} />
          <Kpi label="نسبة الحضور" value={pct(totals.rate)} tone="success"
            hint="(حاضر + مأمورية) ÷ الأيام المسجلة" />
          <Kpi label="غياب" value={totals.absent} tone={totals.absent ? "danger" : "muted"} />
          <Kpi label="إجازة / مأمورية" value={`${totals.leave} / ${totals.mission}`} tone="warning" />
          <Kpi label="إذونات" value={permY.length} />
          <Kpi label="أيام سهر" value={otY.length} />
          <Kpi label="مخالفات" value={violY.length} tone={violY.length ? "danger" : "muted"} />
          <Kpi label="ملفات مستلمة" value={filesY.length} />
        </div>

        {/* ── Error ── */}
        {error && <p className="text-xs text-danger">{error}</p>}

        {/* ── نظرة عامة ── */}
        {tab === "overview" && (
          <>
            <div className="eg-card !p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-text">
                  {year === "all" ? "الحضور لكل سنة" : `الحضور شهريًا — ${year}`}
                </h2>
              </div>
              {buckets.length ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={buckets} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d3148" vertical={false} />
                      <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#1a1d27", border: "1px solid #2d3148", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="present" name="حاضر" stackId="a" fill={STATUS_COLORS.present} />
                      <Bar dataKey="mission" name="مأمورية" stackId="a" fill={STATUS_COLORS.mission} />
                      <Bar dataKey="leave" name="إجازة" stackId="a" fill={STATUS_COLORS.leave} />
                      <Bar dataKey="absent" name="غياب" stackId="a" fill={STATUS_COLORS.absent} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState message="لا توجد بيانات حضور" />}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="eg-card !p-0 overflow-hidden lg:col-span-2">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-card2 text-subtext">
                      <th className="px-3 py-2 text-right font-semibold">الفترة</th>
                      <th className="px-2 py-2 text-center font-semibold">حاضر</th>
                      <th className="px-2 py-2 text-center font-semibold">غياب</th>
                      <th className="px-2 py-2 text-center font-semibold">إجازة</th>
                      <th className="px-2 py-2 text-center font-semibold">مأمورية</th>
                      <th className="px-2 py-2 text-center font-semibold">إذن</th>
                      <th className="px-2 py-2 text-center font-semibold">سهر</th>
                      <th className="px-2 py-2 text-center font-semibold">مخالفات</th>
                      <th className="px-2 py-2 text-center font-semibold">نسبة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buckets.slice().reverse().map(b => (
                      <tr key={b.key} className="border-t border-border/40 hover:bg-card2/50">
                        <td className="px-3 py-1.5 text-text">{b.label}</td>
                        <td className="px-2 py-1.5 text-center text-success tabular-nums">{b.present}</td>
                        <td className={cn("px-2 py-1.5 text-center tabular-nums", b.absent ? "text-danger font-bold" : "text-subtext")}>{b.absent}</td>
                        <td className="px-2 py-1.5 text-center text-warning tabular-nums">{b.leave}</td>
                        <td className="px-2 py-1.5 text-center text-accent tabular-nums">{b.mission}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums">{b.permissions}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums">{b.overtime}</td>
                        <td className={cn("px-2 py-1.5 text-center tabular-nums", b.violations ? "text-danger" : "text-subtext")}>{b.violations}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums">{pct(b.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {buckets.length === 0 && <p className="text-center py-6 text-xs text-subtext">لا توجد بيانات</p>}
              </div>

              <div className="eg-card !p-4 space-y-3">
                <h2 className="text-sm font-bold text-text">الإذونات حسب النوع</h2>
                {permByType.length ? permByType.map(([type, n]) => (
                  <div key={type} className="flex items-center justify-between text-xs">
                    <span className="text-subtext">{type}</span>
                    <span className="font-bold text-text tabular-nums">{n}</span>
                  </div>
                )) : <p className="text-xs text-subtext">لا توجد إذونات</p>}
                <div className="border-t border-border/40 pt-3">
                  <h2 className="text-sm font-bold text-text mb-2">المهارات</h2>
                  {techSkills.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {techSkills.map(ts => (
                        <span key={ts.skill_id}
                          className="bg-accent/10 text-accent text-[11px] px-2 py-0.5 rounded-md border border-accent/20">
                          {ts.skill_name}
                        </span>
                      ))}
                    </div>
                  ) : <p className="text-xs text-subtext">لا توجد مهارات</p>}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── الحضور ── */}
        {tab === "att" && (
          <div className="eg-card !p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-card2/50">
              <span className="text-xs text-subtext">{attList.length} يوم</span>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="eg-select !py-1 !text-xs w-32">
                {["الكل", "حاضر", "غياب", "أجازة", "مأمورية"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            {attList.length ? (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-subtext">
                    <th className="px-4 py-2 text-right font-semibold">التاريخ</th>
                    <th className="px-3 py-2 text-right font-semibold">الحالة</th>
                    <th className="px-3 py-2 text-right font-semibold">الإذن</th>
                    <th className="px-3 py-2 text-center font-semibold">سهر</th>
                  </tr>
                </thead>
                <tbody>
                  {attList.map(a => (
                    <tr key={a.date} className="border-t border-border/40 hover:bg-card2/50">
                      <td className="px-4 py-1.5 text-subtext tabular-nums">{a.date}</td>
                      <td className="px-3 py-1.5"><Badge label={a.status} /></td>
                      <td className="px-3 py-1.5 text-text">{permByDate.get(a.date) ?? "—"}</td>
                      <td className="px-3 py-1.5 text-center">{otDates.has(a.date) ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState message="لا توجد سجلات حضور" />}
          </div>
        )}

        {/* ── الإذونات ── */}
        {tab === "perm" && <SimpleTable
          empty="لا توجد إذونات"
          head={["التاريخ", "نوع الإذن"]}
          rows={permY.slice().sort((a, b) => b.date.localeCompare(a.date))
            .map(p => [p.date, p.permission_type])} />}

        {/* ── العمل الإضافي ── */}
        {tab === "ot" && <SimpleTable
          empty="لا يوجد سجل سهر / عمل إضافي"
          head={["التاريخ"]}
          rows={otY.slice().sort((a, b) => b.date.localeCompare(a.date)).map(o => [o.date])} />}

        {/* ── المخالفات ── */}
        {tab === "viol" && <SimpleTable
          empty="لا توجد مخالفات"
          head={["التاريخ", "السبب", "التفاصيل"]}
          rows={violY.slice().sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
            .map(v => [v.date, v.reason, v.details ?? "—"])} />}

        {/* ── الإنتاجية ── */}
        {tab === "prod" && <SimpleTable
          empty="لا توجد سجلات إنتاجية"
          head={["التاريخ", "أمر الشغل", "المهمة", "ملاحظات"]}
          rows={prodY.map(p => [p.work_date, p.wo_number ?? "—", p.task, p.notes ?? "—"])} />}

        {/* ── الملفات ── */}
        {tab === "files" && <SimpleTable
          empty="لا توجد ملفات مستلمة"
          head={["الملف", "النوع", "أمر الشغل", "تاريخ التسليم"]}
          rows={filesY.map(f => [f.file_name, f.file_type ?? "—", f.wo_number ?? "—", f.delivery_date ?? "—"])} />}

        {/* ── البيانات ── */}
        {tab === "info" && (
          <div className="eg-card !p-4 max-w-md space-y-3">
            {[["الاسم", tech.name], ["الدرجة", tech.grade ?? "—"], ["خط السير", tech.route ?? "—"], ["القسم", tech.department ?? "—"]]
              .map(([l, v]) => (
                <div key={l} className="flex items-center justify-between border-b border-border/30 pb-2 text-sm">
                  <span className="text-text">{v}</span>
                  <span className="text-subtext text-xs">{l}</span>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ── مودال التعديل ── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="تعديل بيانات الفني">
        <div className="space-y-4">
          <div>
            <label className="eg-label">الاسم</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="eg-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eg-label">الدرجة</label>
              <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} className="eg-select">
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="eg-label">خط السير</label>
              <input value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))} className="eg-input" />
            </div>
          </div>
          <div>
            <label className="eg-label">المهارات</label>
            <div className="bg-card2 rounded-lg p-3 max-h-40 overflow-y-auto grid grid-cols-2 gap-2">
              {allSkills.map(s => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm text-text">
                  <input type="checkbox" checked={form.skill_ids.includes(s.id)}
                    onChange={() => toggleSkill(s.id)} className="accent-emerald-500 w-4 h-4" />
                  {s.skill_name}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={saveEdit} disabled={saving} className="eg-btn-success w-full justify-center">
            <Save className="w-4 h-4" />{saving ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </div>
      </Modal>

      {/* ── تأكيد الحذف ── */}
      <Modal open={delConfirm} onClose={() => setDelConfirm(false)} title="تأكيد الحذف" size="sm">
        <p className="text-text text-sm mb-5 text-right">
          هل أنت متأكد من حذف الفني <strong>{tech.name}</strong>؟
          <br /><span className="text-danger text-xs">سيتم حذف جميع بياناته (حضور، مخالفات، إنتاجية)</span>
        </p>
        <div className="flex gap-3">
          <button onClick={() => setDelConfirm(false)} className="eg-btn-ghost flex-1 justify-center">إلغاء</button>
          <button onClick={deleteTech} disabled={deleting} className="eg-btn-danger flex-1 justify-center">
            <Trash2 className="w-4 h-4" />{deleting ? "جاري الحذف..." : "نعم، احذف"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════════ مكونات صغيرة ═══════════════════════ */

const TONES: Record<string, string> = {
  success: "text-success", danger: "text-danger", warning: "text-warning", muted: "text-subtext", default: "text-text",
};

function Kpi({ label, value, tone = "default", hint }: {
  label: string; value: string | number; tone?: keyof typeof TONES; hint?: string;
}) {
  return (
    <div className="eg-card !p-3" title={hint}>
      <div className={cn("text-lg font-bold tabular-nums", TONES[tone])}>{value}</div>
      <div className="text-[11px] text-subtext mt-0.5">{label}</div>
    </div>
  );
}

function SimpleTable({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <div className="eg-card"><EmptyState message={empty} /></div>;
  return (
    <div className="eg-card !p-0 overflow-hidden">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-card2 text-subtext">
            {head.map(h => <th key={h} className="px-4 py-2 text-right font-semibold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/40 hover:bg-card2/50">
              {r.map((cell, j) => (
                <td key={j} className={cn("px-4 py-1.5", j === 0 ? "text-subtext tabular-nums" : "text-text")}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
