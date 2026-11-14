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
  Users, UserX, CalendarX2, Palmtree, Briefcase, Plus, Trash2, X, Settings2,
} from "lucide-react";
import { buildOvertimeForm, downloadBlob } from "@/lib/overtime-form";
import Modal from "@/components/ui/Modal";
import Field from "@/components/ui/Field";
import { deptLabel } from "@/lib/roles";
import { buildWeeklyCard } from "@/lib/weekly-card";

const NOT_RECORDED = "—";
const ATT_OPTS = [NOT_RECORDED, "حاضر", "غياب", "أجازة", "مأمورية"];
const PERM_OPTS = ["—", "إذن ساعتين صباحي", "إذن ساعتين مسائي", "إذن نصف يوم صباحي", "إذن نصف يوم مسائي"];

type AttRow = { tech_id: number; status: string; permission: string; overtime: boolean };
type YearAttRow = { tech_id: number; date: string; status: string };
// تعيين فني على بند أمر شغل في اليوم (الفني ممكن يكون ليه أكتر من بند)
type Assignment = { key: string; id?: number; tech_id: number; wo_id: number | null; item_id: number | null; task: string };
// مجموعة في قسم: مشرف + أعضاء (فنيين أو مساعدين)
type GroupRow = { id: number; department: string; name: string; supervisor_id: number | null };
type Totals = { techs: number; present: number; absent: number; leave: number; mission: number };
// قطعة من القسم: مجموعة، أو "بدون مجموعة" (ids: المشرف أول واحد)
type Section = { key: string; title: string; sub: string; ids: number[] };
type PerTechRow = { tech: any; present: number; absent: number; leave: number; mission: number; records: YearAttRow[] };
type AssignableItem = { id: number; wo_id: number; item_no: number; description: string | null; wo_number: string; approved?: boolean };
type Tab = "daily" | "stats";

export default function AttendanceClient({
  initialTechnicians, role, department, isManager, departments, initialYearAttendance, assignableItems,
  groups, groupMembers,
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
  const canManageGroups = isManager || role === "admin";
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [yearAttendance, setYearAttendance] = useState<YearAttRow[]>(initialYearAttendance);
  const [statsMonth, setStatsMonth] = useState(today().slice(0, 7));
  const [expandedTech, setExpandedTech] = useState<number | null>(null);
  // كارت ساعات العمل الأسبوعية
  const [cardOpen, setCardOpen] = useState(false);
  const [cardFrom, setCardFrom] = useState(today());
  const [cardTo, setCardTo] = useState(today());
  const [cardBusy, setCardBusy] = useState(false);

  const exportWeeklyCard = async () => {
    if (!cardFrom || !cardTo || cardFrom > cardTo) { toast.error("اختار فترة صحيحة"); return; }
    setCardBusy(true);
    try {
      const [att, perm, ot, asg] = await Promise.all([
        supabase.from("attendance").select("tech_id, date, status").gte("date", cardFrom).lte("date", cardTo),
        supabase.from("permissions").select("tech_id, date, permission_type").gte("date", cardFrom).lte("date", cardTo),
        supabase.from("overtime").select("tech_id, date").eq("has_overtime", true).gte("date", cardFrom).lte("date", cardTo),
        supabase.from("technician_assignments")
          .select("tech_id, date, work_order_item_id, item:work_order_items(item_no, work_order:work_orders(wo_number))")
          .gte("date", cardFrom).lte("date", cardTo),
      ]);
      const err = [att.error, perm.error, ot.error, asg.error].find(Boolean);
      if (err) throw new Error(err.message);
      const blob = await buildWeeklyCard({
        from: cardFrom, to: cardTo,
        groups: groups as any[],
        groupMembers,
        technicians: initialTechnicians as any[],
        attendance: (att.data ?? []) as any[],
        permissions: (perm.data ?? []) as any[],
        overtime: (ot.data ?? []) as any[],
        assignments: (asg.data ?? []) as any[],
      });
      downloadBlob(blob, `كارت_ساعات_${cardFrom}_${cardTo}.docx`);
      setCardOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCardBusy(false);
    }
  };

  const visibleTechnicians = useMemo(() => {
    if (!isManager || selectedDept === "الكل") return initialTechnicians;
    return initialTechnicians.filter(t => t.department === selectedDept);
  }, [initialTechnicians, selectedDept, isManager]);

  const techById = useMemo(() => new Map(visibleTechnicians.map(t => [t.id, t] as const)), [visibleTechnicians]);
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
    if (asg.error) toast.error("تعذّر تحميل التعيينات: " + asg.error.message);
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
    const attMap = Object.fromEntries((att.data ?? []).map(r => [r.tech_id, r.status] as const));
    const permMap = Object.fromEntries((perm.data ?? []).map(r => [r.tech_id, r.permission_type] as const));
    const otMap = Object.fromEntries((ot.data ?? []).map(r => [r.tech_id, r.has_overtime] as const));
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
      (JSON.parse(savedSnapshot || "[]") as AttRow[]).map(r => [r.tech_id, r] as const)
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

    // ─── تفاصيل الإشعار: إيه اللي اتغير لكل فني (إشعار بس، من غير إيميل) ───
    const techName = (id: number) => techById.get(id)?.name ?? `#${id}`;
    const asgLabel = (a: Assignment) => {
      const it = assignableItems.find(i => i.id === a.item_id);
      return it ? `${it.wo_number} #${it.item_no}` : "بند";
    };
    const notifyLines: { label: string; value: string }[] = [];
    changed.forEach(r => {
      const s = saved.get(r.tech_id);
      const parts: string[] = [];
      if (!s || s.status !== r.status) parts.push(`الحضور: ${s?.status ?? "—"} ← ${r.status}`);
      if (!s || s.permission !== r.permission) parts.push(`الإذن: ${s?.permission ?? "—"} ← ${r.permission}`);
      if (!s || s.overtime !== r.overtime) parts.push(`عمل إضافي: ${r.overtime ? "نعم" : "لا"}`);
      if (parts.length) notifyLines.push({ label: techName(r.tech_id), value: parts.join(" · ") });
    });
    assignments.filter(a => !a.id && a.item_id).forEach(a =>
      notifyLines.push({ label: techName(a.tech_id), value: `تعيين جديد: ${asgLabel(a)}${a.task ? ` — ${a.task}` : ""}` }));
    savedAssign.filter(a => a.id && !assignments.some(x => x.id === a.id && x.item_id)).forEach(a =>
      notifyLines.push({ label: techName(a.tech_id), value: `إلغاء تعيين: ${asgLabel(a)}` }));
    const shownLines = notifyLines.slice(0, 8);
    const hiddenCount = notifyLines.length - shownLines.length;
    const notifyDetails = [
      ...shownLines,
      ...(hiddenCount > 0 ? [{ label: "…", value: `و${hiddenCount} تعديل تاني` }] : []),
    ];

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
        title: `تعديل حضور — ${date}`,
        body: `${notifyLines.length} تعديل`,
        details: notifyDetails,
        url: "/attendance",
        email: false,   // الإيميل بيتبعت مرة واحدة 4 العصر، مش مع كل تعديل
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

  // تقسيم الفنيين الظاهرين: قسم ← مجموعاته (المشرف أول واحد ثم الأعضاء) ← بدون مجموعة
  const layout = useMemo(() => {
    const nameOf = new Map(initialTechnicians.map(t => [t.id, t.name] as const));
    const groupById = new Map(groups.map(g => [g.id, g] as const));
    const groupOf = new Map<number, GroupRow>();
    groups.forEach(g => { if (g.supervisor_id && !groupOf.has(g.supervisor_id)) groupOf.set(g.supervisor_id, g); });
    groupMembers.forEach(m => { const g = groupById.get(m.group_id); if (g) groupOf.set(m.tech_id, g); });

    const depts = new Map<string, { groups: Map<number, number[]>; loose: number[] }>();
    visibleTechnicians.forEach(t => {
      const dept = t.department || "بدون قسم";
      if (!depts.has(dept)) depts.set(dept, { groups: new Map(), loose: [] });
      const d = depts.get(dept)!;
      const g = groupOf.get(t.id);
      if (g) d.groups.set(g.id, [...(d.groups.get(g.id) ?? []), t.id]);
      else d.loose.push(t.id);
    });

    return Array.from(depts.entries())
      .sort(([a], [b]) => deptLabel(a).localeCompare(deptLabel(b), "ar"))
      .map(([dept, d]) => {
        const sections: Section[] = Array.from(d.groups.entries())
          .map(([gid, ids]) => {
            const g = groupById.get(gid)!;
            const sup = g.supervisor_id;
            return {
              key: `g${gid}`,
              title: g.name,
              sub: sup ? `مشرف: ${nameOf.get(sup) ?? "—"}` : "بدون مشرف",
              ids: [...ids].sort((x, y) => (x === sup ? -1 : 0) - (y === sup ? -1 : 0)),
            };
          })
          .sort((a, b) => a.title.localeCompare(b.title, "ar"));
        if (d.loose.length) sections.push({ key: `l-${dept}`, title: "بدون مجموعة", sub: "", ids: d.loose });
        return { dept, label: deptLabel(dept), sections };
      });
  }, [visibleTechnicians, initialTechnicians, groups, groupMembers]);

  // جدول اليوم بنفس التقسيم
  const dailyItems = useMemo(() => {
    type Item = { kind: "head"; dept: string } | { kind: "row"; r: AttRow }
      | { kind: "total"; dept: string; t: { techs: number; present: number; absent: number; leave: number; mission: number; notRecorded: number } };
    const rowById = new Map(rows.map(r => [r.tech_id, r] as const));
    const out: Item[] = [];
    layout.forEach(d => d.sections.forEach(sec => {
      const secRows = sec.ids.map(id => rowById.get(id)).filter((r): r is AttRow => !!r);
      if (!secRows.length) return;
      const t = { techs: secRows.length, present: 0, absent: 0, leave: 0, mission: 0, notRecorded: 0 };
      secRows.forEach(r => {
        if (r.status === "حاضر") t.present++;
        else if (r.status === "غياب") t.absent++;
        else if (r.status === "أجازة") t.leave++;
        else if (r.status === "مأمورية") t.mission++;
        else t.notRecorded++;
      });
      out.push({ kind: "head", dept: `${d.label} · ${sec.title}${sec.sub ? ` — ${sec.sub}` : ""}` });
      secRows.forEach(r => out.push({ kind: "row", r }));
      out.push({ kind: "total", dept: sec.title, t });
    }));
    return out;
  }, [rows, layout]);

  const perTechById = useMemo(() => new Map(perTechMonthly.map(r => [r.tech.id, r] as const)), [perTechMonthly]);
  const totalsOf = (ids: number[]): Totals => ids.reduce((a, id) => {
    const r = perTechById.get(id);
    return r
      ? { techs: a.techs + 1, present: a.present + r.present, absent: a.absent + r.absent, leave: a.leave + r.leave, mission: a.mission + r.mission }
      : a;
  }, { techs: 0, present: 0, absent: 0, leave: 0, mission: 0 });

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
                        <th className="w-64">التعيين</th>
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
                            <td>
                              {(() => {
                                const mine = assignments.filter(a => a.tech_id === r.tech_id);
                                return (
                                  <div className="flex flex-col items-start gap-1">
                                    {mine.map(a => {
                                      const it = assignableItems.find(i => i.id === a.item_id);
                                      return (
                                        <span key={a.key} className="eg-chip text-[11px]">
                                          {it ? `${it.wo_number} · #${it.item_no}` : "بند غير متاح"}
                                          {a.task && <span className="text-subtext"> — {a.task}</span>}
                                        </span>
                                      );
                                    })}
                                    <button type="button" onClick={() => setAssignTech(r.tech_id)}
                                      aria-label={`تعيين ${tech.name}`} className="eg-btn-ghost eg-btn-sm">
                                      {mine.length ? "تعديل" : "+ تعيين"}
                                    </button>
                                  </div>
                                );
                              })()}
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
                  {canManageGroups && (
                    <button type="button" onClick={() => setGroupsOpen(true)} className="eg-btn-ghost eg-btn-sm">
                      <Settings2 className="size-3.5" />إدارة المجموعات
                    </button>
                  )}
                  <button type="button" onClick={() => setCardOpen(true)} className="eg-btn-ghost eg-btn-sm">
                    <Printer className="size-3.5" />كارت الساعات
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

            {/* كل قسم ← مجموعاته، وكل مجموعة: المشرف ثم الأعضاء */}
            {layout.length === 0 ? (
              <div className="eg-card"><EmptyState icon={Users} message="لا يوجد فنيين لعرض إحصائياتهم" /></div>
            ) : layout.map(d => (
              <section key={d.dept} className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-text">{d.label}</h3>
                  <TotalsLine t={totalsOf(d.sections.flatMap(sec => sec.ids))} />
                </div>
                {d.sections.map(sec => (
                  <div key={sec.key} className="eg-card overflow-hidden !p-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-card2/50 px-4 py-2.5">
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-text">{sec.title}</span>
                        {sec.sub && <span className="text-xs text-subtext"> · {sec.sub}</span>}
                      </div>
                      <TotalsLine t={totalsOf(sec.ids)} />
                    </div>
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
                          {sec.ids.map(id => {
                            const row = perTechById.get(id);
                            if (!row) return null;
                            const { tech, present, absent, leave, mission, records } = row;
                            const open = expandedTech === tech.id;
                            return (
                              <Fragment key={id}>
                                <tr onClick={() => setExpandedTech(open ? null : tech.id)}
                                  className={cn("cursor-pointer", open && "bg-accent/[0.06] [&>td]:border-b-0")}>
                                  <td className="font-medium text-text">
                                    {tech.name}
                                    {tech.grade && <span className="ms-2 align-middle"><Badge label={tech.grade} /></span>}
                                  </td>
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
                  </div>
                ))}
              </section>
            ))}
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
            const woList = Array.from(new Map(assignableItems.map(i => [i.wo_id, i.wo_number] as const)).entries());
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
                      {itemsOfWo.map(i => <option key={i.id} value={i.id}>#{i.item_no} {i.description ?? ""}{i.approved === false ? " (غير معتمد)" : ""}</option>)}
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

      {/* ── كارت ساعات العمل الأسبوعية ── */}
      <Modal open={cardOpen} onClose={() => setCardOpen(false)} title="كارت ساعات العمل" description="ورقة لكل مجموعة في ملف واحد" size="sm">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="من">
              <input type="date" value={cardFrom} onChange={e => setCardFrom(e.target.value)} className="eg-input" />
            </Field>
            <Field label="إلى">
              <input type="date" value={cardTo} onChange={e => setCardTo(e.target.value)} className="eg-input" />
            </Field>
          </div>
          <p className="text-[11px] text-subtext">
            كل بند = عدد اللي اشتغلوا عليه × 8 ساعات، والإذن بيتخصم، والعمل الإضافي 4 ساعات لكل شخص.
          </p>
          <button type="button" onClick={exportWeeklyCard} disabled={cardBusy} className="eg-btn-primary w-full justify-center">
            {cardBusy ? <Spinner className="size-3.5" /> : <Printer className="size-3.5" />}
            {cardBusy ? "جاري التحضير..." : "تحميل الكارت"}
          </button>
        </div>
      </Modal>

      {/* ── إدارة مجموعات الأقسام ── */}
      {canManageGroups && (
        <GroupsManager open={groupsOpen} onClose={() => setGroupsOpen(false)}
          groups={groups} groupMembers={groupMembers} technicians={initialTechnicians}
          onChanged={() => router.refresh()} />
      )}
    </Page>
  );
}

// سطر المجاميع: حاضر · غياب · إجازة · مأمورية
function TotalsLine({ t }: { t: Totals }) {
  return (
    <span className="text-xs tabular-nums text-subtext">
      {t.techs} فرد · <span className="text-success">حاضر {t.present}</span> · <span className="text-danger">غياب {t.absent}</span>
      {" "}· <span className="text-warning">إجازة {t.leave}</span> · <span className="text-accent">مأمورية {t.mission}</span>
    </span>
  );
}

// إدارة المجموعات: لكل قسم مجموعات، كل مجموعة ليها مشرف (درجة "مشرف") وأعضاء (فني أو مساعد)
// العضو في مجموعة واحدة بس، والقاعدة دي متأكدة كمان في الداتابيز (032_department_groups)
function GroupsManager({
  open, onClose, groups, groupMembers, technicians, onChanged,
}: {
  open: boolean; onClose: () => void; groups: GroupRow[];
  groupMembers: { group_id: number; tech_id: number }[];
  technicians: Technician[]; onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const depts = useMemo(
    () => Array.from(new Set(technicians.map(t => t.department).filter((d): d is string => !!d)))
      .sort((a, b) => deptLabel(a).localeCompare(deptLabel(b), "ar")),
    [technicians]
  );
  const [dept, setDept] = useState("");
  const [name, setName] = useState("");
  const [sup, setSup] = useState("");
  const [busy, setBusy] = useState(false);
  const activeDept = dept || depts[0] || "";

  const deptTechs = technicians.filter(t => t.department === activeDept);
  const supervisors = deptTechs.filter(t => t.grade === "مشرف");
  const deptGroups = groups.filter(g => g.department === activeDept);
  const memberIds = new Set(groupMembers.map(m => m.tech_id));
  const freeMembers = deptTechs.filter(t => (t.grade === "فني" || t.grade === "مساعد") && !memberIds.has(t.id));
  const nameOf = new Map(technicians.map(t => [t.id, t] as const));

  const run = async (op: PromiseLike<{ error: { message: string } | null }>, ok?: string) => {
    setBusy(true);
    const { error } = await op;
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    if (ok) toast.success(ok);
    onChanged();
    return true;
  };

  const create = async () => {
    if (!name.trim() || !activeDept) return;
    const done = await run(supabase.from("department_groups").insert({
      department: activeDept, name: name.trim(), supervisor_id: sup ? Number(sup) : null,
    }), "اتضافت المجموعة");
    if (done) { setName(""); setSup(""); }
  };
  const remove = async (g: GroupRow) => {
    const ok = await confirm({
      title: `حذف ${g.name}؟`,
      message: "الأعضاء هيرجعوا \"بدون مجموعة\"، وسجلات الحضور مش هتتأثر.",
      tone: "danger", confirmText: "حذف",
    });
    if (ok) run(supabase.from("department_groups").delete().eq("id", g.id), "اتحذفت المجموعة");
  };

  return (
    <Modal open={open} onClose={onClose} title="إدارة المجموعات"
      description="كل قسم بيتقسم لمجموعات: مشرف + أعضاء من الفنيين أو المساعدين" size="lg">
      <div className="space-y-4">
        {depts.length > 1 && (
          <ChipRow>
            {depts.map(d => (
              <FilterChip key={d} active={activeDept === d} onClick={() => setDept(d)}>{deptLabel(d)}</FilterChip>
            ))}
          </ChipRow>
        )}

        {/* مجموعة جديدة */}
        <div className="rounded-lg border border-border/60 p-3">
          <p className="mb-2 text-xs font-semibold text-subtext">مجموعة جديدة في {deptLabel(activeDept)}</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="اسم المجموعة"
              aria-label="اسم المجموعة" className="eg-input" />
            <select value={sup} onChange={e => setSup(e.target.value)} aria-label="المشرف" className="eg-select">
              <option value="">— المشرف —</option>
              {supervisors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="button" onClick={create} disabled={busy || !name.trim()} className="eg-btn-primary justify-center">
              <Plus className="size-3.5" />إضافة
            </button>
          </div>
          {supervisors.length === 0 && (
            <p className="mt-2 text-[11px] text-subtext">مفيش حد بدرجة &quot;مشرف&quot; في القسم ده، غيّر درجته من صفحة الفنيين.</p>
          )}
        </div>

        {deptGroups.length === 0 ? (
          <p className="py-3 text-center text-xs text-subtext">مفيش مجموعات في القسم ده لسه</p>
        ) : deptGroups.map(g => {
          const members = groupMembers.filter(m => m.group_id === g.id).map(m => nameOf.get(m.tech_id)).filter((t): t is Technician => !!t);
          return (
            <div key={g.id} className="space-y-2.5 rounded-lg border border-border/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="me-auto text-sm font-bold text-text">{g.name}</span>
                <select value={g.supervisor_id ?? ""} disabled={busy} aria-label={`مشرف ${g.name}`} className="eg-select eg-input-sm w-44"
                  onChange={e => run(supabase.from("department_groups")
                    .update({ supervisor_id: e.target.value ? Number(e.target.value) : null }).eq("id", g.id))}>
                  <option value="">— بدون مشرف —</option>
                  {supervisors.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button type="button" onClick={() => remove(g)} disabled={busy}
                  aria-label={`حذف ${g.name}`} className="eg-btn-danger-soft eg-btn-sm eg-btn-icon">
                  <Trash2 className="size-3.5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {members.length === 0 && <span className="text-[11px] text-subtext">مفيش أعضاء</span>}
                {members.map(t => (
                  <span key={t.id} className="eg-chip inline-flex items-center gap-1.5">
                    {t.name}
                    {t.grade && <span className="text-[10px] text-subtext">{t.grade}</span>}
                    <button type="button" disabled={busy} aria-label={`إزالة ${t.name}`}
                      onClick={() => run(supabase.from("department_group_members").delete().eq("group_id", g.id).eq("tech_id", t.id))}
                      className="text-subtext hover:text-danger">
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>

              <select value="" disabled={busy || freeMembers.length === 0} aria-label={`إضافة عضو لـ ${g.name}`} className="eg-select eg-input-sm w-full sm:w-64"
                onChange={e => e.target.value && run(supabase.from("department_group_members")
                  .insert({ group_id: g.id, tech_id: Number(e.target.value) }))}>
                <option value="">{freeMembers.length ? "+ إضافة عضو" : "كل الفنيين والمساعدين متوزعين"}</option>
                {freeMembers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.grade})</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
