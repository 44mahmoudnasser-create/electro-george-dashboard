"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Technician } from "@/types";
import { today, cn } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Spinner from "@/components/ui/Spinner";
import Tooltip from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { Page, PageHeader, PageBody, SectionHeader } from "@/components/ui/Page";
import { StatCard, StatPill } from "@/components/ui/StatCard";
import { Tabs } from "@/components/ui/Tabs";
import { FilterChip, ChipRow } from "@/components/ui/Filters";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  Save, RefreshCw, ChevronDown, Printer, CalendarCheck, ClipboardCheck, BarChart3,
  Users, UserX, CalendarX2, Palmtree, Briefcase, Download, Check, Plus,
} from "lucide-react";
import { buildOvertimeForm, downloadBlob } from "@/lib/overtime-form";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";

const NOT_RECORDED = "—";
const ATT_OPTS = [NOT_RECORDED, "حاضر", "غياب", "أجازة", "مأمورية"];
const PERM_OPTS = ["—", "إذن ساعتين صباحي", "إذن ساعتين مسائي", "إذن نصف يوم صباحي", "إذن نصف يوم مسائي"];

type AttRow = { tech_id: number; status: string; permission: string; overtime: boolean };
type YearAttRow = { tech_id: number; date: string; status: string };
// تعيين فني على بند أمر شغل في اليوم (الفني ممكن يكون ليه أكتر من بند)
type Assignment = { key: string; id?: number; tech_id: number; wo_id: number | null; item_id: number | null; task: string };
type GroupRow = { id: number; name: string; department_code: string | null; supervisorName: string | null };
type Totals = { techs: number; present: number; absent: number; leave: number; mission: number };
type FlatItem =
  | { kind: "section"; key: string; label: string }
  | { kind: "group"; key: string; label: string; sub: string }
  | { kind: "tech"; key: string; row: PerTechRow }
  | { kind: "total"; key: string; label: string; t: Totals; strong: boolean };
type PerTechRow = { tech: any; present: number; absent: number; leave: number; mission: number; records: YearAttRow[] };
type AssignableItem = { id: number; wo_id: number; item_no: number; description: string | null; wo_number: string };
type Tab = "daily" | "stats";

export default function AttendanceClient({
  initialTechnicians, role, department, isManager, departments, initialYearAttendance, assignableItems,
  groups, groupMembers, departmentList,
}: {
  initialTechnicians: Technician[];
  role: string;
  department: string | null;
  isManager: boolean;
  departments: string[];
  initialYearAttendance: YearAttRow[];
  assignableItems: AssignableItem[];
  groups: GroupRow[];
  groupMembers: { group_id: number; tech_id: number }[];
  departmentList: { code: string; name_ar: string }[];
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("daily");
  const [date, setDate] = useState(today());
  const [selectedDept, setSelectedDept] = useState<string>(isManager ? "الكل" : (department ?? ""));
  const [rows, setRows] = useState<AttRow[]>([]);
  // "[]" مش "" علشان شارة "تغييرات غير محفوظة" ماتظهرش قبل أول تحميل
  const [savedSnapshot, setSavedSnapshot] = useState("[]");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignSnapshot, setAssignSnapshot] = useState("[]");
  const [assignTech, setAssignTech] = useState<number | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [yearAttendance, setYearAttendance] = useState<YearAttRow[]>(initialYearAttendance);
  const [statsMonth, setStatsMonth] = useState(today().slice(0, 7));
  const [expandedTech, setExpandedTech] = useState<number | null>(null);

  const visibleTechnicians = useMemo(() => {
    if (!isManager || selectedDept === "الكل") return initialTechnicians;
    return initialTechnicians.filter(t => t.department === selectedDept);
  }, [initialTechnicians, selectedDept, isManager]);

  const techById = useMemo(() => new Map(visibleTechnicians.map(t => [t.id, t])), [visibleTechnicians]);
  const visibleTechIds = useMemo(() => new Set(visibleTechnicians.map(t => t.id)), [visibleTechnicians]);

  const dirty = useMemo(
    () => JSON.stringify(rows) !== savedSnapshot || JSON.stringify(assignments) !== assignSnapshot,
    [rows, savedSnapshot, assignments, assignSnapshot]
  );

  /* ─────────── تحميل يوم ─────────── */
  const load = async () => {
    setLoading(true);
    const techIds = visibleTechnicians.map(t => t.id);
    if (techIds.length === 0) {
      setRows([]); setSavedSnapshot("[]"); setLoading(false);
      return;
    }
    const [att, perm, ot, asg] = await Promise.all([
      supabase.from("attendance").select("tech_id,status").eq("date", date).in("tech_id", techIds),
      supabase.from("permissions").select("tech_id,permission_type").eq("date", date).in("tech_id", techIds),
      supabase.from("overtime").select("tech_id,has_overtime").eq("date", date).in("tech_id", techIds),
      supabase.from("technician_assignments")
        .select("id, tech_id, work_order_item_id, task, item:work_order_items(wo_id)")
        .eq("date", date).in("tech_id", techIds).order("id", { ascending: true }),
    ]);
    const asgNext: Assignment[] = (asg.data ?? []).map((r: any) => ({
      key: `s${r.id}`,
      id: r.id,
      tech_id: r.tech_id,
      item_id: r.work_order_item_id,
      wo_id: (Array.isArray(r.item) ? r.item[0]?.wo_id : r.item?.wo_id) ?? null,
      task: r.task ?? "",
    }));
    setAssignments(asgNext);
    setAssignSnapshot(JSON.stringify(asgNext));
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
  const confirmDiscard = async () =>
    !dirty || await confirm({
      title: "فيه تغييرات مش محفوظة",
      message: "لو كمّلت هتضيع التعديلات اللي ماتحفظتش.",
      confirmText: "تجاهل التغييرات",
      tone: "primary",
    });

  const changeDate = async (value: string) => {
    if (value === date || !(await confirmDiscard())) return;
    setDate(value);
  };

  const changeDept = async (value: string) => {
    if (value === selectedDept || !(await confirmDiscard())) return;
    setSelectedDept(value);
  };

  const setRow = (tech_id: number, patch: Partial<AttRow>) =>
    setRows(prev => prev.map(r => r.tech_id === tech_id ? { ...r, ...patch } : r));

  /* ─────────── حفظ: بيبعت بس الصفوف اللي اتغيرت، في طلبات مجمعة ─────────── */
  const save = async () => {
    if (saving) return;
    const saved = new Map<number, AttRow>(
      (JSON.parse(savedSnapshot || "[]") as AttRow[]).map(r => [r.tech_id, r])
    );
    const changed = rows.filter(r => {
      const s = saved.get(r.tech_id);
      return !s || s.status !== r.status || s.permission !== r.permission || s.overtime !== r.overtime;
    });
    const savedAssign: Assignment[] = JSON.parse(assignSnapshot || "[]");
    const assignChanged = JSON.stringify(assignments) !== assignSnapshot;
    if (changed.length === 0 && !assignChanged) {
      toast.info("مفيش تغييرات تتحفظ");
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

      // التعيينات: اللي اتشالت، واللي اتضافت، واللي اتغير بندها أو نصها
      const keepIds = new Set(assignments.filter(a => a.id && a.item_id).map(a => a.id!));
      const asgDeleteIds = savedAssign.filter(a => a.id && !keepIds.has(a.id)).map(a => a.id!);
      const asgInserts = assignments
        .filter(a => !a.id && a.item_id)
        .map(a => ({ tech_id: a.tech_id, date, work_order_item_id: a.item_id, task: a.task.trim() || null }));
      const asgUpdates = assignments.filter(a => {
        if (!a.id || !a.item_id) return false;
        const s0 = savedAssign.find(x => x.id === a.id);
        return !!s0 && (s0.item_id !== a.item_id || s0.task !== a.task);
      });
      if (asgDeleteIds.length) ops.push(supabase.from("technician_assignments").delete().in("id", asgDeleteIds));
      if (asgInserts.length) ops.push(supabase.from("technician_assignments").insert(asgInserts));
      asgUpdates.forEach(a => ops.push(
        supabase.from("technician_assignments")
          .update({ work_order_item_id: a.item_id, task: a.task.trim() || null })
          .eq("id", a.id!)
      ));

      const results = await Promise.all(ops);
      const failed = results.find(r => r.error);
      if (failed?.error) throw new Error(failed.error.message);
    } catch (e) {
      setSaving(false);
      toast.error((e as Error).message || "حصل خطأ أثناء الحفظ");
      return;
    }
    setSaving(false);
    setSavedSnapshot(JSON.stringify(rows));
    await load();   // نجيب التعيينات بالـ IDs الجديدة

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

    toast.success(`تم الحفظ (${changed.length} ${changed.length === 1 ? "فني" : "فنيين"})`);
  };

  /* ─────────── كشف العمل الإضافي ─────────── */
  const printOvertimeForm = async () => {
    const techIds = visibleTechnicians.map(t => t.id);
    if (techIds.length === 0 || printing) return;
    setPrinting(true);
    const { data, error } = await supabase.from("overtime")
      .select("tech_id").eq("date", date).eq("has_overtime", true).in("tech_id", techIds);
    if (error) { setPrinting(false); toast.error(error.message); return; }
    const otIds = new Set((data ?? []).map(r => r.tech_id));
    const people = visibleTechnicians
      .filter(t => otIds.has(t.id))
      .map(t => ({ name: t.name, route: t.route ?? null, dept: t.department ?? null }));
    if (people.length === 0) {
      setPrinting(false);
      toast.warning("مفيش عمل إضافي محفوظ في التاريخ ده");
      return;
    }
    try {
      const blob = await buildOvertimeForm(date, people);
      downloadBlob(blob, `كشف_عمل_إضافي_${date}.docx`);
    } catch (e) {
      toast.error((e as Error).message);
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
  }).sort((a, b) =>
    (a.tech.department || "").localeCompare(b.tech.department || "", "ar") || b.absent - a.absent
  ), [visibleTechnicians, monthRecords]);

  // جدول اليوم متقسم حسب القسم: عنوان لكل قسم، ومجموع الحضور/الغياب/الإجازة/المأمورية في آخره
  const dailyItems = useMemo(() => {
    const withDept = rows
      .map(r => ({ r, dept: techById.get(r.tech_id)?.department || "بدون قسم" }))
      .filter(x => techById.get(x.r.tech_id));
    withDept.sort((a, b) => a.dept.localeCompare(b.dept, "ar"));
    type Item = { kind: "head"; dept: string } | { kind: "row"; r: AttRow } | { kind: "total"; dept: string; t: { techs: number; present: number; absent: number; leave: number; mission: number; notRecorded: number } };
    const out: Item[] = [];
    let bucket: { r: AttRow; dept: string }[] = [];
    const flush = (dept: string) => {
      const t = { techs: bucket.length, present: 0, absent: 0, leave: 0, mission: 0, notRecorded: 0 };
      bucket.forEach(x => {
        if (x.r.status === "حاضر") t.present++;
        else if (x.r.status === "غياب") t.absent++;
        else if (x.r.status === "أجازة") t.leave++;
        else if (x.r.status === "مأمورية") t.mission++;
        else t.notRecorded++;
      });
      out.push({ kind: "total", dept, t });
    };
    withDept.forEach((x, i) => {
      if (i === 0 || withDept[i - 1].dept !== x.dept) {
        if (i > 0) flush(withDept[i - 1].dept);
        bucket = [];
        out.push({ kind: "head", dept: x.dept });
      }
      bucket.push(x);
      out.push({ kind: "row", r: x.r });
    });
    if (withDept.length) flush(withDept[withDept.length - 1].dept);
    return out;
  }, [rows, techById]);

  // شجرة الجدول: قسم ← مجموعات (مشرف + أعضاء) ← مجموع كل مجموعة ← مجموع القسم
  const flatRows = useMemo<FlatItem[]>(() => {
    const deptName = (code: string | null) => departmentList.find(d => d.code === code)?.name_ar ?? code ?? "بدون قسم";
    const memberOf = new Map<number, number>();
    groupMembers.forEach(m => { if (!memberOf.has(m.tech_id)) memberOf.set(m.tech_id, m.group_id); });
    const groupById = new Map(groups.map(g => [g.id, g]));
    const tot = (rs: PerTechRow[]): Totals => rs.reduce((a, r) => ({
      techs: a.techs + 1, present: a.present + r.present, absent: a.absent + r.absent,
      leave: a.leave + r.leave, mission: a.mission + r.mission,
    }), { techs: 0, present: 0, absent: 0, leave: 0, mission: 0 });

    type Sec = { key: string; label: string; groups: Map<number, { g: GroupRow; rows: PerTechRow[] }>; loose: PerTechRow[] };
    const secs = new Map<string, Sec>();
    const secFor = (key: string, label: string) => {
      if (!secs.has(key)) secs.set(key, { key, label, groups: new Map(), loose: [] });
      return secs.get(key)!;
    };
    perTechMonthly.forEach(row => {
      const gid = memberOf.get(row.tech.id);
      const g = gid !== undefined ? groupById.get(gid) : undefined;
      if (g) {
        const sec = secFor(`code:${g.department_code ?? ""}`, deptName(g.department_code));
        if (!sec.groups.has(g.id)) sec.groups.set(g.id, { g, rows: [] });
        sec.groups.get(g.id)!.rows.push(row);
      } else {
        const d = row.tech.department || "بدون قسم";
        secFor(`raw:${d}`, d).loose.push(row);
      }
    });

    const out: FlatItem[] = [];
    Array.from(secs.values()).sort((a, b) => a.label.localeCompare(b.label, "ar")).forEach(sec => {
      out.push({ kind: "section", key: `s-${sec.key}`, label: sec.label });
      let all: PerTechRow[] = [];
      Array.from(sec.groups.values()).forEach(({ g, rows }) => {
        out.push({ kind: "group", key: `g-${g.id}`, label: g.name, sub: g.supervisorName ? `مشرف: ${g.supervisorName}` : "بدون مشرف" });
        rows.forEach(r => out.push({ kind: "tech", key: `t-${r.tech.id}`, row: r }));
        out.push({ kind: "total", key: `gt-${g.id}`, label: `مجموع ${g.name}`, t: tot(rows), strong: false });
        all = all.concat(rows);
      });
      if (sec.loose.length) {
        out.push({ kind: "group", key: `l-${sec.key}`, label: "بدون مجموعة", sub: "" });
        sec.loose.forEach(r => out.push({ kind: "tech", key: `t-${r.tech.id}`, row: r }));
        out.push({ kind: "total", key: `lt-${sec.key}`, label: "مجموع بدون مجموعة", t: tot(sec.loose), strong: false });
        all = all.concat(sec.loose);
      }
      out.push({ kind: "total", key: `st-${sec.key}`, label: `مجموع ${sec.label}`, t: tot(all), strong: true });
    });
    return out;
  }, [perTechMonthly, groups, groupMembers, departmentList]);

  // مجاميع كل قسم (بتتعرض جوه جدول الفنيين)
  const deptTotals = useMemo(() => {
    const m = new Map<string, { techs: number; present: number; absent: number; leave: number; mission: number }>();
    perTechMonthly.forEach(r => {
      const k = r.tech.department || "بدون قسم";
      const g = m.get(k) ?? { techs: 0, present: 0, absent: 0, leave: 0, mission: 0 };
      g.techs += 1; g.present += r.present; g.absent += r.absent; g.leave += r.leave; g.mission += r.mission;
      m.set(k, g);
    });
    return m;
  }, [perTechMonthly]);

  // إحصائيات الأقسام للشهر (نفس الفنيين اللي شايفهم الصفحة)
  const deptMonthly = useMemo(() => {
    const groups = new Map<string, { dept: string; techs: number; present: number; absent: number; leave: number; mission: number }>();
    visibleTechnicians.forEach(t => {
      const key = t.department || "بدون قسم";
      if (!groups.has(key)) groups.set(key, { dept: key, techs: 0, present: 0, absent: 0, leave: 0, mission: 0 });
      const g = groups.get(key)!;
      const recs = monthRecords.filter(r => r.tech_id === t.id);
      g.techs += 1;
      g.present += count(recs, "حاضر");
      g.absent += count(recs, "غياب");
      g.leave += count(recs, "أجازة");
      g.mission += count(recs, "مأمورية");
    });
    return Array.from(groups.values()).sort((a, b) => a.dept.localeCompare(b.dept, "ar"));
  }, [visibleTechnicians, monthRecords]);

  // تصدير إحصائيات الأقسام لملف CSV (بيتفتح عربي في Excel)
  const exportDeptStats = () => {
    if (deptMonthly.length === 0) { toast.error("مفيش بيانات للتصدير"); return; }
    const head = ["القسم", "عدد الفنيين", "أيام الحضور", "أيام الغياب", "أيام الإجازة", "أيام المأمورية"];
    const body = deptMonthly.map(g => [g.dept, g.techs, g.present, g.absent, g.leave, g.mission]);
    const sum = (k: "techs" | "present" | "absent" | "leave" | "mission") =>
      deptMonthly.reduce((a, g) => a + g[k], 0);
    const total = ["الإجمالي", sum("techs"), sum("present"), sum("absent"), sum("leave"), sum("mission")];
    const rows: (string | number)[][] = [[`إحصائيات الأقسام — ${monthLabel}`], head, ...body, total];
    const csv = rows
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `احصائيات_الاقسام_${statsMonth}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("اتصدّرت إحصائيات الأقسام");
  };

  const monthLabel = useMemo(() => {
    const [y, m] = statsMonth.split("-").map(Number);
    if (!y || !m) return statsMonth;
    return new Date(y, m - 1, 1).toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
  }, [statsMonth]);

  // عدد صفوف الهيكل وإحنا بنحمّل اليوم (قريب من عدد الفنيين)
  const skeletonRows = Math.min(Math.max(visibleTechnicians.length, 3), 8);

  /* ═══════════════════════ العرض ═══════════════════════ */
  return (
    <Page width="6xl">
      <PageHeader
        title="الحضور والإذونات"
        icon={CalendarCheck}
        meta={tab === "daily" && dirty ? <Badge label="تغييرات غير محفوظة" tone="warning" /> : undefined}
        actions={tab === "daily" ? (
          <>
            <input type="date" value={date} onChange={e => changeDate(e.target.value)}
              aria-label="التاريخ" className="eg-input eg-input-sm w-36" />
            <Tooltip content="تحديث" side="bottom">
              <button onClick={load} disabled={loading} aria-label="تحديث" className="eg-btn-ghost eg-btn-sm eg-btn-icon">
                <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
              </button>
            </Tooltip>
            <Tooltip content="كشف العمل الإضافي للمتسجلين في التاريخ ده" side="bottom">
              <button onClick={printOvertimeForm} disabled={printing} className="eg-btn-ghost eg-btn-sm">
                {printing ? <Spinner className="size-3.5" /> : <Printer className="size-3.5" />}
                كشف عمل إضافي
              </button>
            </Tooltip>
            <button onClick={save} disabled={saving || !dirty || rows.length === 0} className="eg-btn-success eg-btn-sm">
              {saving ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
              {saving ? "جاري الحفظ..." : "حفظ"}
            </button>
          </>
        ) : undefined}
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            ariaLabel="أقسام الصفحة"
            items={[
              { value: "daily", label: "تسجيل اليوم", icon: <ClipboardCheck className="size-3.5" /> },
              { value: "stats", label: "الإحصائيات", icon: <BarChart3 className="size-3.5" /> },
            ]}
          />
        }
      >
        {/* فلتر الأقسام (للمدير بس) */}
        {isManager && (
          <ChipRow>
            {["الكل", ...departments].map(d => (
              <FilterChip key={d} active={selectedDept === d} onClick={() => changeDept(d)}>
                {d === "الكل" ? "كل الأقسام" : d}
              </FilterChip>
            ))}
          </ChipRow>
        )}
      </PageHeader>

      <PageBody>
        {tab === "daily" ? (
          <>
            {/* ملخص اليوم */}
            <div className="flex flex-wrap items-center gap-2">
              <StatPill label="لم يُسجل" value={daySummary.unrecorded} tone="muted" />
              <StatPill label="حاضر" value={daySummary.present} tone="success" />
              <StatPill label="غياب" value={daySummary.absent} tone="danger" />
              <StatPill label="إجازة" value={daySummary.leave} tone="warning" />
              <StatPill label="مأمورية" value={daySummary.mission} tone="accent" />
              <span aria-hidden className="mx-0.5 hidden h-5 w-px bg-border sm:block" />
              <StatPill label="إذن" value={daySummary.permission} tone="muted" />
              <StatPill label="عمل إضافي" value={daySummary.overtime} tone="muted" />
            </div>

            {/* جدول اليوم */}
            <div className="eg-card overflow-hidden !p-0">
              {!loading && rows.length === 0 ? (
                <EmptyState icon={Users} message="لا يوجد فنيين" description="أضف الفنيين أولاً" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="eg-table min-w-[640px]" aria-busy={loading}>
                    <thead>
                      <tr>
                        <th>الاسم</th>
                        <th className="w-44">الحضور</th>
                        <th className="w-56">الإذن</th>
                        <th className="w-32 text-center">التعيين</th>
                        <th className="w-24 text-center">عمل إضافي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? Array.from({ length: skeletonRows }, (_, i) => (
                        <tr key={`sk${i}`} aria-hidden>
                          <td>
                            <Skeleton className="h-3.5 w-32" />
                            <Skeleton className="mt-2 h-2.5 w-20" />
                          </td>
                          <td><Skeleton className="h-[30px] w-full" /></td>
                          <td><Skeleton className="h-[30px] w-full" /></td>
                          <td><Skeleton className="mx-auto size-4 rounded" /></td>
                        </tr>
                      )) : dailyItems.map((item, itemIdx) => {
                        if (item.kind === "head") {
                          return (
                            <tr key={`dh-${item.dept}-${itemIdx}`} className="bg-card2/70">
                              <td colSpan={5} className="text-xs font-bold text-accent">{item.dept}</td>
                            </tr>
                          );
                        }
                        if (item.kind === "total") {
                          const t = item.t;
                          return (
                            <tr key={`dt-${item.dept}-${itemIdx}`} className="border-t-2 border-border bg-accent/5 font-semibold">
                              <td className="text-text">مجموع {item.dept} ({t.techs} فني)</td>
                              <td colSpan={4} className="text-xs text-subtext">
                                <span className="text-success">حاضر {t.present}</span> · <span className="text-danger">غياب {t.absent}</span> · <span className="text-warning">إجازة {t.leave}</span> · <span className="text-accent">مأمورية {t.mission}</span>
                                {t.notRecorded > 0 && <span> · لم يُسجل {t.notRecorded}</span>}
                              </td>
                            </tr>
                          );
                        }
                        const r = item.r;
                        const tech = techById.get(r.tech_id);
                        if (!tech) return null;
                        const isAbsent = r.status === "غياب";
                        return (
                          <tr key={r.tech_id} className={cn(isAbsent && "bg-danger/[0.05]")}>
                            <td>
                              <div className="font-medium text-text">{tech.name}</div>
                              {(tech.route || tech.department) && (
                                <div className="text-[11px] text-subtext">{[tech.department, tech.route].filter(Boolean).join(" · ")}</div>
                              )}
                            </td>
                            <td>
                              <select value={r.status} onChange={e => setRow(r.tech_id, { status: e.target.value })}
                                aria-label={`حضور ${tech.name}`}
                                className={cn("eg-select eg-input-sm w-full",
                                  isAbsent && "!border-danger/50 !bg-danger/10 !text-danger")}>
                                {ATT_OPTS.map(o => <option key={o} value={o}>{o === NOT_RECORDED ? "لم يُسجل" : o}</option>)}
                              </select>
                            </td>
                            <td>
                              <select value={r.permission} onChange={e => setRow(r.tech_id, { permission: e.target.value })}
                                aria-label={`إذن ${tech.name}`} className="eg-select eg-input-sm w-full">
                                {PERM_OPTS.map(o => <option key={o}>{o}</option>)}
                              </select>
                            </td>
                            <td className="text-center">
                              <button type="button" onClick={() => setAssignTech(r.tech_id)}
                                aria-label={`تعيين ${tech.name}`} className="eg-btn-ghost eg-btn-sm">
                                {assignments.filter(a => a.tech_id === r.tech_id).length || "+"} تعيين
                              </button>
                            </td>
                            <td className="text-center">
                              <input type="checkbox" checked={r.overtime}
                                onChange={e => setRow(r.tech_id, { overtime: e.target.checked })}
                                aria-label={`عمل إضافي ${tech.name}`} className="align-middle" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* شريط الشهر */}
            <SectionHeader
              title={`إحصائيات ${monthLabel}`}
              description="اضغط على أي فني علشان تشوف أيامه في الشهر."
              actions={
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setGroupsOpen(true)} className="eg-btn-ghost eg-btn-sm">
                    <Users className="size-3.5" />المجاميع
                  </button>
                  <input type="month" value={statsMonth} onChange={e => setStatsMonth(e.target.value)}
                    aria-label="شهر الإحصائيات" className="eg-input eg-input-sm w-40" />
                </div>
              }
            />

            {/* كروت مختصرة */}
            <div className="eg-stagger grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label={`غياب ${monthLabel}`} value={monthTotals.absent} tone={monthTotals.absent ? "danger" : "muted"} icon={UserX} />
              <StatCard label={`غياب سنة ${yearStr}`} value={yearAbsent} tone={yearAbsent ? "danger" : "muted"} icon={CalendarX2} />
              <StatCard label={`إجازات ${monthLabel}`} value={monthTotals.leave} tone={monthTotals.leave ? "warning" : "muted"} icon={Palmtree} />
              <StatCard label={`مأموريات ${monthLabel}`} value={monthTotals.mission} tone={monthTotals.mission ? "accent" : "muted"} icon={Briefcase} />
            </div>

            {/* تفصيل لكل فني */}
            <div className="eg-card overflow-hidden !p-0">
              {perTechMonthly.length === 0 ? (
                <EmptyState icon={Users} message="لا يوجد فنيين لعرض إحصائياتهم" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="eg-table min-w-[520px]">
                    <thead>
                      <tr>
                        <th>الاسم</th>
                        <th className="w-20 text-center">حاضر</th>
                        <th className="w-20 text-center">غياب</th>
                        <th className="w-20 text-center">إجازة</th>
                        <th className="w-20 text-center">مأمورية</th>
                        <th className="w-12"><span className="sr-only">السجلات</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {flatRows.map(item => {
                        if (item.kind === "section") {
                          return (
                            <tr key={item.key} className="bg-accent/10">
                              <td colSpan={6} className="text-xs font-bold text-accent">{item.label}</td>
                            </tr>
                          );
                        }
                        if (item.kind === "group") {
                          return (
                            <tr key={item.key} className="bg-card2/60">
                              <td colSpan={6} className="text-xs">
                                <span className="font-semibold text-text">{item.label}</span>
                                {item.sub && <span className="text-subtext"> · {item.sub}</span>}
                              </td>
                            </tr>
                          );
                        }
                        if (item.kind === "total") {
                          return (
                            <tr key={item.key} className={item.strong ? "border-t-2 border-border bg-accent/5 font-bold" : "bg-accent/[0.03] font-semibold"}>
                              <td className="text-text">{item.label} ({item.t.techs} فني)</td>
                              <td className="text-center tabular-nums text-success">{item.t.present}</td>
                              <td className="text-center tabular-nums text-danger">{item.t.absent}</td>
                              <td className="text-center tabular-nums text-warning">{item.t.leave}</td>
                              <td className="text-center tabular-nums text-accent">{item.t.mission}</td>
                              <td />
                            </tr>
                          );
                        }
                        const row = item.row;
                        const { tech, present, absent, leave, mission, records } = row;
                        const open = expandedTech === tech.id;
                        return (
                          <Fragment key={item.key}>
                            <tr onClick={() => setExpandedTech(open ? null : tech.id)}
                              className={cn("cursor-pointer", open && "bg-accent/[0.06] [&>td]:border-b-0")}>
                              <td className="font-medium text-text">{tech.name}</td>
                              <td className={cn("text-center tabular-nums", present ? "text-success" : "text-subtext")}>{present}</td>
                              <td className={cn("text-center tabular-nums", absent > 0 ? "font-bold text-danger" : "text-subtext")}>{absent}</td>
                              <td className={cn("text-center tabular-nums", leave ? "text-warning" : "text-subtext")}>{leave}</td>
                              <td className={cn("text-center tabular-nums", mission ? "text-accent" : "text-subtext")}>{mission}</td>
                              <td className="text-end">
                                {/* الضغطة بتوصل للصف نفسه فبيتفتح/يتقفل (والزرار علشان الكيبورد) */}
                                <button type="button" aria-expanded={open}
                                  aria-label={`${open ? "إخفاء" : "عرض"} سجلات ${tech.name}`} className="eg-icon-btn">
                                  <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180 text-accent")} />
                                </button>
                              </td>
                            </tr>
                            {open && (
                              <tr>
                                <td colSpan={6} className="animate-fade-in bg-accent/[0.03] px-4 pb-3.5 pt-1 hover:bg-accent/[0.03]">
                                  {records.length === 0 ? (
                                    <p className="text-xs text-subtext">لا توجد سجلات هذا الشهر</p>
                                  ) : (
                                    <ul className="flex flex-wrap gap-1.5">
                                      {records.map((r, i) => (
                                        <li key={i}
                                          className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card py-1 pe-1 ps-2.5 shadow-card">
                                          <span className="text-[11px] tabular-nums text-subtext">{r.date}</span>
                                          <Badge label={r.status} />
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </PageBody>

      {/* ── تعيين الفني على بنود الأوامر ── */}
      <Modal open={assignTech !== null} onClose={() => setAssignTech(null)}
        title={`تعيين ${techById.get(assignTech ?? -1)?.name ?? ""}`} description={`يوم ${date}`} size="md">
        <div className="space-y-3">
          {assignments.filter(a => a.tech_id === assignTech).length === 0 && (
            <p className="text-xs text-subtext">مفيش تعيينات للفني ده في اليوم ده</p>
          )}
          {assignments.filter(a => a.tech_id === assignTech).map(a => {
            const woList = Array.from(new Map(assignableItems.map(i => [i.wo_id, i.wo_number])).entries());
            const itemsOfWo = assignableItems.filter(i => i.wo_id === a.wo_id);
            const update = (patch: Partial<Assignment>) =>
              setAssignments(prev => prev.map(x => x.key === a.key ? { ...x, ...patch } : x));
            return (
              <div key={a.key} className="grid grid-cols-12 gap-2 items-end rounded-lg border border-border/60 p-2">
                <div className="col-span-4">
                  <Field label="أمر الشغل">
                    <select value={a.wo_id ?? ""} className="eg-select"
                      onChange={e => update({ wo_id: e.target.value ? Number(e.target.value) : null, item_id: null })}>
                      <option value="">— اختار —</option>
                      {woList.map(([id, num]) => <option key={id} value={id}>{num}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="col-span-4">
                  <Field label="البند">
                    <select value={a.item_id ?? ""} disabled={!a.wo_id} className="eg-select"
                      onChange={e => update({ item_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">— اختار —</option>
                      {itemsOfWo.map(i => <option key={i.id} value={i.id}>#{i.item_no} {i.description ?? ""}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="col-span-3">
                  <Field label="العمل المكلف به">
                    <input value={a.task} onChange={e => update({ task: e.target.value })} className="eg-input" />
                  </Field>
                </div>
                <div className="col-span-1">
                  <button type="button" aria-label="إزالة"
                    onClick={() => setAssignments(prev => prev.filter(x => x.key !== a.key))}
                    className="eg-icon-btn w-full justify-center text-danger">×</button>
                </div>
              </div>
            );
          })}
          <button type="button"
            onClick={() => setAssignments(prev => [...prev, { key: `n${Date.now()}`, tech_id: assignTech!, wo_id: null, item_id: null, task: "" }])}
            className="eg-btn-ghost eg-btn-sm">+ إضافة تعيين</button>
          <p className="text-[11px] text-subtext">التعيينات بتتحفظ مع زرار "حفظ" في أعلى الصفحة.</p>
        </div>
      </Modal>

      {/* ── إدارة المجاميع (لكل قسم: مشرف + أعضاء) ── */}
      <GroupsManager open={groupsOpen} onClose={() => setGroupsOpen(false)} groups={groups} groupMembers={groupMembers}
        technicians={initialTechnicians} departmentList={departmentList} defaultDept={isManager ? "" : (departmentCodeOf(department, departmentList) ?? "")}
        onChanged={() => router.refresh()} toast={toast} />
    </Page>
  );
}

// كود القسم من اسم القسم اللي عند المستخدم (بيطابق الـ aliases)
function departmentCodeOf(dept: string | null, list: { code: string; name_ar: string }[]) {
  if (!dept) return null;
  const v = dept.trim().toLowerCase();
  return list.find(d => d.code.toLowerCase() === v || d.name_ar.trim().toLowerCase() === v)?.code ?? null;
}

// مدير المجاميع: إنشاء مجموعة (اسم + قسم + مشرف) وإضافة/إزالة أعضاء
function GroupsManager({
  open, onClose, groups, groupMembers, technicians, departmentList, defaultDept, onChanged, toast,
}: {
  open: boolean; onClose: () => void; groups: GroupRow[]; groupMembers: { group_id: number; tech_id: number }[];
  technicians: { id: number; name: string; grade: string | null; department: string | null }[];
  departmentList: { code: string; name_ar: string }[]; defaultDept: string; onChanged: () => void; toast: any;
}) {
  const [name, setName] = useState("");
  const [dept, setDept] = useState(defaultDept);
  const [sup, setSup] = useState("");
  const [busy, setBusy] = useState(false);
  const supervisors = technicians.filter(t => t.grade === "مشرف");
  const create = async () => {
    if (!name.trim() || !dept) return;
    setBusy(true);
    const { error } = await supabase.from("assembly_groups").insert({
      name: name.trim(), department_code: dept, supervisor_id: sup ? Number(sup) : null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setName(""); setSup("");
    toast.success("اتضافت المجموعة");
    onChanged();
  };
  const toggleMember = async (gid: number, tid: number, on: boolean) => {
    const { error } = on
      ? await supabase.from("assembly_group_members").delete().eq("group_id", gid).eq("tech_id", tid)
      : await supabase.from("assembly_group_members").insert({ group_id: gid, tech_id: tid });
    if (error) { toast.error(error.message); return; }
    onChanged();
  };
  return (
    <Modal open={open} onClose={onClose} title="المجاميع" description="كل مجموعة تابعة لقسم، ليها مشرف وأعضاء" size="md">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="rounded-lg border border-border/60 p-3 space-y-2">
          <p className="text-[11px] text-subtext">مجموعة جديدة</p>
          <div className="grid grid-cols-12 gap-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم المجموعة" className="eg-input col-span-4" />
            <select value={dept} onChange={e => setDept(e.target.value)} className="eg-select col-span-3">
              <option value="">— القسم —</option>
              {departmentList.map(d => <option key={d.code} value={d.code}>{d.name_ar}</option>)}
            </select>
            <select value={sup} onChange={e => setSup(e.target.value)} className="eg-select col-span-3">
              <option value="">— المشرف —</option>
              {supervisors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="button" onClick={create} disabled={busy || !name.trim() || !dept} className="eg-btn-primary col-span-2 justify-center">
              <Plus className="size-3.5" />إضافة
            </button>
          </div>
        </div>
        {groups.map(g => {
          const memIds = new Set(groupMembers.filter(m => m.group_id === g.id).map(m => m.tech_id));
          return (
            <div key={g.id} className="rounded-lg border border-border/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-text">{g.name}</span>
                <span className="text-[11px] text-subtext">
                  {departmentList.find(d => d.code === g.department_code)?.name_ar ?? "—"} · {g.supervisorName ? `مشرف: ${g.supervisorName}` : "بدون مشرف"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {technicians.map(t => {
                  const on = memIds.has(t.id);
                  return (
                    <button key={t.id} type="button" onClick={() => toggleMember(g.id, t.id, on)}
                      className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]",
                        on ? "border-accent/50 bg-accent/15 text-accent" : "border-border bg-card2 text-subtext hover:text-text")}>
                      {on ? <Check className="size-3" /> : <Plus className="size-3" />}{t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {groups.length === 0 && <p className="text-xs text-subtext text-center py-3">مفيش مجاميع بعد</p>}
      </div>
    </Modal>
  );
}
