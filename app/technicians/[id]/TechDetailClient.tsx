"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { deptLabel } from "@/lib/roles";
import { CHART, chartAxisTick, chartTooltipStyle } from "@/lib/chart-theme";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Field, { FormError } from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import Tooltip from "@/components/ui/Tooltip";
import { Page, PageHeader, PageBody, SectionHeader } from "@/components/ui/Page";
import { StatCard, ProgressBar } from "@/components/ui/StatCard";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, CartesianGrid } from "recharts";
import { Pencil, Trash2, Save, Check, CalendarCheck } from "lucide-react";
import CustodyPanel, { type CustodyRow, type ToolLite, type ItemLite } from "./CustodyPanel";

const GRADES = ["فني", "مشرف", "مساعد"] as const;
const ATT_STATUSES = ["الكل", "حاضر", "غياب", "أجازة", "مأمورية"];

// مفتاح ألوان الرسم (نفس ألوان الأعمدة من lib/chart-theme)
const LEGEND = [
  { label: "حاضر", dot: "bg-success" },
  { label: "مأمورية", dot: "bg-accent" },
  { label: "إجازة", dot: "bg-warning" },
  { label: "غياب", dot: "bg-danger" },
];

type Tab = "overview" | "att" | "perm" | "ot" | "viol" | "prod" | "files" | "custody" | "info";
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
// الأرقام الصفرية بلون هادي علشان المهم يبان
const numTone = (n: number, tone: string) => (n ? tone : "text-subtext");

export default function TechDetailClient({
  tech, allSkills, techSkills, attendance, permissions, overtime, violations, productivity, filesReceived,
  custody, tools, availableItems, role,
}: {
  tech: any; allSkills: any[]; techSkills: { skill_id: number; skill_name?: string }[];
  attendance: { date: string; status: string }[];
  permissions: { date: string; permission_type: string }[];
  overtime: { date: string; has_overtime: boolean }[];
  violations: { date: string; reason: string; details: string }[];
  productivity: any[];
  filesReceived: any[];
  custody: CustodyRow[];
  tools: ToolLite[];
  availableItems: ItemLite[];
  role: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

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

  const openEdit = () => { setError(""); setEditOpen(true); };
  const closeEdit = () => { setEditOpen(false); setError(""); };

  const saveEdit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving || !form.name.trim()) return;
    setSaving(true); setError("");
    const { error: e1 } = await supabase.from("technicians")
      .update({ name: form.name, grade: form.grade, route: form.route })
      .eq("id", tech.id);
    if (e1) { setSaving(false); setError(e1.message); return; }
    const { error: eDel } = await supabase.from("tech_skills").delete().eq("tech_id", tech.id);
    if (eDel) { setSaving(false); setError(eDel.message); return; }
    if (form.skill_ids.length > 0) {
      const { error: e2 } = await supabase.from("tech_skills").insert(
        form.skill_ids.map(skill_id => ({ tech_id: tech.id, skill_id }))
      );
      if (e2) { setSaving(false); setError(e2.message); return; }
    }
    setSaving(false); setEditOpen(false);
    toast.success("تم حفظ بيانات الفني");
    router.refresh();
  };

  const deleteTech = async () => {
    if (deleting) return;
    const ok = await confirm({
      title: "حذف الفني؟",
      message: <>هيتحذف الفني <span className="font-semibold text-text">{tech.name}</span> وكل بياناته (حضور، إذونات، سهر، مخالفات، إنتاجية). الإجراء ده مش هينفع يترجع.</>,
      confirmText: "نعم، احذف",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    // نفس ترتيب الحذف بالظبط؛ بنسجل أول خطأ علشان مايعديش بصمت
    let firstError: string | null = null;
    for (const t of ["tech_skills", "violations", "attendance", "permissions", "overtime", "daily_productivity"]) {
      const { error: e } = await supabase.from(t).delete().eq("tech_id", tech.id);
      if (e && !firstError) firstError = e.message;
    }
    const { error: eFiles } = await supabase.from("files").update({ delivered_to: null }).eq("delivered_to", tech.id);
    if (eFiles && !firstError) firstError = eFiles.message;
    const { error: eTech } = await supabase.from("technicians").delete().eq("id", tech.id);
    if (eTech) { setDeleting(false); toast.error(eTech.message); return; }
    if (firstError) toast.warning(`اتحذف الفني، بس فيه سجلات ماتحذفتش: ${firstError}`);
    else toast.success("تم حذف الفني");
    router.push("/technicians");
  };

  const TABS: TabItem<Tab>[] = [
    { value: "overview", label: "نظرة عامة" },
    { value: "att", label: "الحضور", count: attY.length },
    { value: "perm", label: "الإذونات", count: permY.length },
    { value: "ot", label: "سهر", count: otY.length },
    { value: "viol", label: "مخالفات", count: violY.length },
    { value: "prod", label: "إنتاجية", count: prodY.length },
    { value: "files", label: "ملفات", count: filesY.length },
    { value: "custody", label: "العهدة", count: custody.filter(c => c.open_qty > 0).length },
    { value: "info", label: "البيانات" },
  ];

  const INFO: [string, React.ReactNode][] = [
    ["الاسم", tech.name],
    ["الدرجة", <Badge key="grade" label={tech.grade ?? "فني"} />],
    ["خط السير", tech.route || "—"],
    ["القسم", tech.department ? deptLabel(tech.department) : "—"],
  ];

  return (
    <Page width="6xl">
      <PageHeader
        back={{ href: "/technicians", label: "الفنيين" }}
        title={tech.name}
        meta={<Badge label={tech.grade ?? "فني"} />}
        subtitle={`${tech.route || "—"}${tech.department ? ` · ${deptLabel(tech.department)}` : ""}`}
        actions={<>
          <select value={year} onChange={e => setYear(e.target.value)} aria-label="السنة" className="eg-select eg-input-sm w-32">
            <option value="all">كل السنوات</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Tooltip content="تعديل">
            <button onClick={openEdit} aria-label="تعديل بيانات الفني" className="eg-btn-ghost eg-btn-sm eg-btn-icon">
              <Pencil className="size-3.5" />
            </button>
          </Tooltip>
          <Tooltip content="حذف">
            <button onClick={deleteTech} disabled={deleting} aria-label="حذف الفني" className="eg-btn-danger-soft eg-btn-sm eg-btn-icon">
              {deleting ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" />}
            </button>
          </Tooltip>
        </>}
        tabs={<Tabs value={tab} onChange={setTab} items={TABS} ariaLabel="أقسام ملف الفني" />}
      />

      <PageBody>
        {/* ── KPIs (دايمًا ظاهرين) ── */}
        <div className="eg-stagger grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <StatCard label="أيام مسجلة" value={totals.recorded} />
          <StatCard label="نسبة الحضور" value={pct(totals.rate)} tone="success"
            hint="(حاضر + مأمورية) ÷ الأيام المسجلة" />
          <StatCard label="غياب" value={totals.absent} tone={totals.absent ? "danger" : "muted"} />
          <StatCard label="إجازة / مأمورية" value={`${totals.leave} / ${totals.mission}`} tone="warning" />
          <StatCard label="إذونات" value={permY.length} />
          <StatCard label="أيام سهر" value={otY.length} />
          <StatCard label="مخالفات" value={violY.length} tone={violY.length ? "danger" : "muted"} />
          <StatCard label="ملفات مستلمة" value={filesY.length} />
        </div>

        {/* ── نظرة عامة ── */}
        {tab === "overview" && (
          <>
            <div className="eg-card space-y-4">
              <SectionHeader
                icon={CalendarCheck}
                title={year === "all" ? "الحضور لكل سنة" : `الحضور شهريًا — ${year}`}
                actions={buckets.length ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtext">
                    {LEGEND.map(l => (
                      <span key={l.label} className="inline-flex items-center gap-1.5">
                        <span aria-hidden className={cn("size-2 rounded-sm", l.dot)} />{l.label}
                      </span>
                    ))}
                  </div>
                ) : undefined}
              />
              {buckets.length ? (
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    {/* الواجهة من اليمين للشمال: أول شهر على اليمين والمحور الرأسي يمين */}
                    <BarChart data={buckets} margin={{ top: 4, right: -16, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                      <XAxis dataKey="label" reversed tick={chartAxisTick} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                      <YAxis orientation="right" tick={chartAxisTick} allowDecimals={false} tickLine={false} axisLine={false} />
                      <ChartTooltip {...chartTooltipStyle} />
                      <Bar dataKey="present" name="حاضر" stackId="a" fill={CHART.success} maxBarSize={40} />
                      <Bar dataKey="mission" name="مأمورية" stackId="a" fill={CHART.accent} maxBarSize={40} />
                      <Bar dataKey="leave" name="إجازة" stackId="a" fill={CHART.warning} maxBarSize={40} />
                      <Bar dataKey="absent" name="غياب" stackId="a" fill={CHART.danger} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState compact message="لا توجد بيانات حضور" />}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="eg-card overflow-hidden !p-0 lg:col-span-2">
                <div className="border-b border-border/60 px-4 py-3">
                  <SectionHeader title={year === "all" ? "التفصيل السنوي" : "التفصيل الشهري"} />
                </div>
                {buckets.length ? (
                  <div className="overflow-x-auto">
                    <table className="eg-table eg-table-compact min-w-[580px]">
                      <thead>
                        <tr>
                          <th>الفترة</th>
                          <th className="text-center">حاضر</th>
                          <th className="text-center">غياب</th>
                          <th className="text-center">إجازة</th>
                          <th className="text-center">مأمورية</th>
                          <th className="text-center">إذن</th>
                          <th className="text-center">سهر</th>
                          <th className="text-center">مخالفات</th>
                          <th className="text-center">نسبة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {buckets.slice().reverse().map(b => (
                          <tr key={b.key}>
                            <td className="whitespace-nowrap text-text">{b.label}</td>
                            <td className={cn("text-center tabular-nums", numTone(b.present, "text-success"))}>{b.present}</td>
                            <td className={cn("text-center tabular-nums", b.absent ? "font-semibold text-danger" : "text-subtext")}>{b.absent}</td>
                            <td className={cn("text-center tabular-nums", numTone(b.leave, "text-warning"))}>{b.leave}</td>
                            <td className={cn("text-center tabular-nums", numTone(b.mission, "text-accent"))}>{b.mission}</td>
                            <td className={cn("text-center tabular-nums", numTone(b.permissions, "text-text"))}>{b.permissions}</td>
                            <td className={cn("text-center tabular-nums", numTone(b.overtime, "text-text"))}>{b.overtime}</td>
                            <td className={cn("text-center tabular-nums", b.violations ? "text-danger" : "text-subtext")}>{b.violations}</td>
                            <td className={cn("text-center tabular-nums", b.rate === null ? "text-subtext" : "font-medium text-text")}>{pct(b.rate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <EmptyState compact message="لا توجد بيانات" />}
              </div>

              <div className="eg-card space-y-4 !p-4">
                <div className="space-y-3">
                  <SectionHeader title="الإذونات حسب النوع" />
                  {permByType.length ? (
                    <ul className="space-y-2.5">
                      {permByType.map(([type, n]) => (
                        <li key={type} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="min-w-0 truncate text-subtext">{type}</span>
                            <span className="font-semibold tabular-nums text-text">{n}</span>
                          </div>
                          <ProgressBar value={(n / permY.length) * 100} label={type} />
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-subtext">لا توجد إذونات</p>}
                </div>
                <div className="space-y-3 border-t border-border/60 pt-4">
                  <SectionHeader title="المهارات" />
                  {techSkills.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {techSkills.map(ts => (
                        <Badge key={ts.skill_id} label={ts.skill_name ?? "—"} tone="accent" dot={false} />
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
          <div className="eg-card overflow-hidden !p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
              <span className="text-xs text-subtext">
                <span className="font-semibold tabular-nums text-text">{attList.length}</span> يوم
              </span>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                aria-label="الحالة" className="eg-select eg-input-sm w-32">
                {ATT_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            {attList.length ? (
              <div className="overflow-x-auto">
                <table className="eg-table min-w-[420px]">
                  <thead>
                    <tr>
                      <th>التاريخ</th>
                      <th>الحالة</th>
                      <th>الإذن</th>
                      <th className="w-20 text-center">سهر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attList.map(a => (
                      <tr key={a.date}>
                        <td className="tabular-nums text-subtext">{a.date}</td>
                        <td><Badge label={a.status} /></td>
                        <td className="text-text">{permByDate.get(a.date) ?? <span className="text-subtext">—</span>}</td>
                        <td className="text-center">
                          {otDates.has(a.date) ? (
                            <span className="inline-flex text-success">
                              <Check className="size-4" strokeWidth={2.5} aria-hidden />
                              <span className="sr-only">سهر</span>
                            </span>
                          ) : <span className="text-subtext">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                message="لا توجد سجلات حضور"
                action={statusFilter !== "الكل"
                  ? <button onClick={() => setStatusFilter("الكل")} className="eg-btn-ghost eg-btn-sm">مسح الفلتر</button>
                  : undefined}
              />
            )}
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
            .map(v => [v.date ?? "—", v.reason, v.details || "—"])} />}

        {/* ── الإنتاجية ── */}
        {tab === "prod" && <SimpleTable
          empty="لا توجد سجلات إنتاجية"
          head={["التاريخ", "أمر الشغل", "المهمة", "ملاحظات"]}
          rows={prodY.map(p => [p.work_date, <WoNumber key="wo" value={p.wo_number} />, p.task, p.notes || "—"])} />}

        {/* ── الملفات ── */}
        {tab === "files" && <SimpleTable
          empty="لا توجد ملفات مستلمة"
          head={["الملف", "النوع", "أمر الشغل", "تاريخ التسليم"]}
          dateCol={3}
          rows={filesY.map(f => [
            f.file_name,
            f.file_type ? <Badge key="type" label={f.file_type} dot={false} /> : "—",
            <WoNumber key="wo" value={f.wo_number} />,
            f.delivery_date ?? "—",
          ])} />}

        {/* ── العهدة ── */}
        {tab === "custody" && (
          <CustodyPanel
            techId={tech.id}
            techName={tech.name}
            techDept={tech.department ?? null}
            role={role}
            custody={custody}
            tools={tools}
            availableItems={availableItems}
          />
        )}

        {/* ── البيانات ── */}
        {tab === "info" && (
          <div className="eg-card max-w-lg overflow-hidden !p-0">
            <div className="border-b border-border/60 px-4 py-3">
              <SectionHeader
                title="بيانات الفني"
                actions={
                  <button onClick={openEdit} className="eg-btn-ghost eg-btn-xs">
                    <Pencil className="size-3" />تعديل
                  </button>
                }
              />
            </div>
            <dl className="divide-y divide-border/50">
              {INFO.map(([l, v]) => (
                <div key={l} className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="shrink-0 text-xs text-subtext">{l}</dt>
                  <dd className="min-w-0 truncate text-sm font-medium text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </PageBody>

      {/* ── مودال التعديل ── */}
      <Modal open={editOpen} onClose={closeEdit} title="تعديل بيانات الفني">
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="الاسم" required>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="eg-input" autoFocus />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="الدرجة">
              <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} className="eg-select">
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="خط السير">
              <input value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))} className="eg-input" />
            </Field>
          </div>
          <Field label={<SkillsLabel count={form.skill_ids.length} />}>
            <SkillChecklist skills={allSkills} selected={form.skill_ids} onToggle={toggleSkill} />
          </Field>
          <FormError>{error}</FormError>
          <button type="submit" disabled={saving || !form.name.trim()} className="eg-btn-success w-full">
            {saving ? <Spinner /> : <Save className="size-4" />}
            {saving ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </form>
      </Modal>
    </Page>
  );
}

/* ═══════════════════════ مكونات صغيرة ═══════════════════════ */

function WoNumber({ value }: { value?: string | null }) {
  if (!value) return <span className="text-subtext">—</span>;
  return <span className="font-mono text-[12px] font-medium text-accent">{value}</span>;
}

function SimpleTable({ head, rows, empty, dateCol = 0 }: {
  head: string[]; rows: React.ReactNode[][]; empty: string; dateCol?: number;
}) {
  if (!rows.length) return <div className="eg-card"><EmptyState message={empty} /></div>;
  return (
    <div className="eg-card overflow-hidden !p-0">
      <div className="overflow-x-auto">
        <table className={cn("eg-table", head.length > 2 && "min-w-[560px]")}>
          <thead>
            <tr>
              {head.map(h => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} className={j === dateCol ? "tabular-nums text-subtext" : "text-text"}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// عنوان المهارات مع عدد المختار
function SkillsLabel({ count }: { count: number }) {
  return (
    <>
      المهارات
      {count > 0 && (
        <span className="mr-1.5 rounded-full bg-accent/15 px-1.5 text-[11px] font-semibold tabular-nums text-accent">{count}</span>
      )}
    </>
  );
}

// اختيار المهارات ككروت checkbox (نفس شكل صفحة الفنيين)
function SkillChecklist({ skills, selected, onToggle }: {
  skills: { id: number; skill_name: string }[]; selected: number[]; onToggle: (id: number) => void;
}) {
  if (skills.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-subtext">
        لا توجد مهارات — أضفها أولاً من تبويب المهارات
      </p>
    );
  }
  return (
    <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2">
      {skills.map(s => {
        const on = selected.includes(s.id);
        return (
          <label key={s.id} className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm text-text transition-colors duration-150",
            on ? "border-accent/50 bg-accent/10" : "border-border/60 bg-card2/50 hover:border-border-strong",
          )}>
            <input type="checkbox" checked={on} onChange={() => onToggle(s.id)} className="shrink-0" />
            <span className="min-w-0 truncate">{s.skill_name}</span>
          </label>
        );
      })}
    </div>
  );
}
