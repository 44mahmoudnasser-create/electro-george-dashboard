"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { PRIORITY_RANK } from "@/lib/status";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import Field, { FormError } from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import Tooltip from "@/components/ui/Tooltip";
import { Page, PageHeader, PageBody } from "@/components/ui/Page";
import { FilterChip, SearchInput } from "@/components/ui/Filters";
import { useToast } from "@/components/ui/Toast";
import {
  Scissors, Settings, Plus, Route, Layers, AlertTriangle, RefreshCw, Info, Check,
  CheckCircle2, Circle, ChevronLeft, Hourglass, Lock,
} from "lucide-react";

/* ═══════════════════════ أنواع وثوابت ═══════════════════════ */

type Stage = "punch" | "cut" | "bend" | "weld";
type View = "total" | Stage;

// الترتيب ده هو ترتيب التصنيع الثابت — المسار دايمًا بيتخزن بيه
const STAGES: { key: Stage; label: string }[] = [
  { key: "punch", label: "البنش" },
  { key: "cut",   label: "المقص" },
  { key: "bend",  label: "التني" },
  { key: "weld",  label: "اللحام" },
];
const STAGE_LABEL = Object.fromEntries(STAGES.map(s => [s.key, s.label])) as Record<Stage, string>;

type WO = { wo_number: string; status: string; priority: string | null; expected_delivery: string | null };
type QueueItem = {
  id: number;
  work_order_id: number;
  qty: number;
  description: string;
  part_no: string | null;
  sheet_steel: string | null;
  thickness: string | null;
  qty_sheet: number;
  sheet_route: Stage[] | null;
  sort_order: number | null;
  work_order?: WO | WO[] | null;
};
type Machine = { id: number; name: string; department: string; notes: string | null; active: boolean; stage: Stage | null };
type Substage = { id?: number; production_item_id: number; stage: string; qty_done: number };
type LogTarget = { item: QueueItem; mode: "stage"; stage: Stage } | { item: QueueItem; mode: "direct" };

const getWO = (it: QueueItem): WO | undefined =>
  (Array.isArray(it.work_order) ? it.work_order[0] : it.work_order) ?? undefined;
const routeOf = (it: QueueItem): Stage[] => it.sheet_route ?? [];
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
const today = () => new Date().toISOString().slice(0, 10);

/* ═══════════════════════ الكومبوننت ═══════════════════════ */

export default function SheetMonitoringClient({
  initialItems, initialMachines, initialSubstages, initialLockedIds, machineRequired,
}: {
  initialItems: QueueItem[]; initialMachines: Machine[]; initialSubstages: Substage[];
  initialLockedIds: number[]; machineRequired: boolean;
}) {
  const toast = useToast();
  const [items, setItems] = useState(initialItems);
  const [machines, setMachines] = useState(initialMachines);
  const [substages, setSubstages] = useState(initialSubstages);
  const [lockedIds, setLockedIds] = useState(() => new Set(initialLockedIds));

  const [view, setView] = useState<View>("total");
  const [search, setSearch] = useState("");
  const [woFilter, setWoFilter] = useState("الكل");
  const [materialFilter, setMaterialFilter] = useState("الكل");
  const [thicknessFilter, setThicknessFilter] = useState("الكل");
  const [lateOnly, setLateOnly] = useState(false);
  const [noRouteOnly, setNoRouteOnly] = useState(false);
  const [showWaiting, setShowWaiting] = useState(false);
  const [groupOverride, setGroupOverride] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [live, setLive] = useState(false);
  const [newItemsPending, setNewItemsPending] = useState(false);

  // التجميع بالخامة/السُمك افتراضي في البنش والمقص، والمستخدم يقدر يغيره
  const grouped = groupOverride ?? (view === "punch" || view === "cut");
  useEffect(() => { setGroupOverride(null); setSelected(new Set()); }, [view]);

  /* ─────────── حسابات المراحل ─────────── */

  const doneMap = useMemo(() => {
    const m = new Map<string, number>();
    substages.forEach(s => m.set(`${s.production_item_id}:${s.stage}`, Number(s.qty_done) || 0));
    return m;
  }, [substages]);

  const doneOf = (id: number, stage: Stage) => doneMap.get(`${id}:${stage}`) ?? 0;

  // حالة البند في مرحلة: المتاح = اللي خلص من المرحلة اللي قبلها في المسار − اللي اتعمل هنا
  const stageInfo = (it: QueueItem, stage: Stage) => {
    const route = routeOf(it);
    const idx = route.indexOf(stage);
    if (idx < 0) return null;
    const done = doneOf(it.id, stage);
    const prevDone = idx === 0 ? it.qty : doneOf(it.id, route[idx - 1]);
    const available = Math.max(0, prevDone - done);
    const pending = Math.max(0, it.qty - done);
    return { done, available, waiting: Math.max(0, pending - available), pending, prevStage: idx > 0 ? route[idx - 1] : null };
  };

  const remainingTotal = (it: QueueItem) => Math.max(0, (it.qty ?? 0) - (it.qty_sheet ?? 0));
  const isLate = (it: QueueItem) => {
    const d = getWO(it)?.expected_delivery;
    return !!d && d < today();
  };

  const queue = useMemo(() => items.filter(it => remainingTotal(it) > 0), [items]);

  /* ─────────── كروت الملخص ─────────── */

  const stats = useMemo(() => {
    const total = {
      items: queue.length,
      pieces: queue.reduce((a, it) => a + remainingTotal(it), 0),
      noRoute: queue.filter(it => routeOf(it).length === 0).length,
      late: queue.filter(isLate).length,
    };
    const perStage = Object.fromEntries(STAGES.map(s => {
      let items = 0, available = 0, waiting = 0;
      queue.forEach(it => {
        const info = stageInfo(it, s.key);
        if (!info) return;
        if (info.available > 0) items++;
        available += info.available;
        waiting += info.waiting;
      });
      return [s.key, { items, available, waiting }];
    })) as Record<Stage, { items: number; available: number; waiting: number }>;
    return { total, perStage };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, doneMap]);

  /* ─────────── الفلاتر والترتيب ─────────── */

  const woOptions = useMemo(
    () => Array.from(new Set(queue.map(it => getWO(it)?.wo_number).filter(Boolean) as string[])).sort(), [queue]);
  const materialOptions = useMemo(
    () => Array.from(new Set(queue.map(it => it.sheet_steel).filter(Boolean) as string[])).sort(), [queue]);
  const thicknessOptions = useMemo(
    () => Array.from(new Set(queue.map(it => it.thickness).filter(Boolean) as string[])).sort(), [queue]);

  const visible = useMemo(() => {
    const list = queue.filter(it => {
      if (view !== "total") {
        const info = stageInfo(it, view);
        if (!info) return false;
        if (info.available <= 0 && !(showWaiting && info.pending > 0)) return false;
      } else if (noRouteOnly && routeOf(it).length > 0) return false;
      const wo = getWO(it);
      if (woFilter !== "الكل" && wo?.wo_number !== woFilter) return false;
      if (materialFilter !== "الكل" && it.sheet_steel !== materialFilter) return false;
      if (thicknessFilter !== "الكل" && it.thickness !== thicknessFilter) return false;
      if (lateOnly && !isLate(it)) return false;
      if (search) {
        const hay = `${it.description} ${it.part_no ?? ""} ${wo?.wo_number ?? ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
    // الأولوية ← تاريخ التسليم ← رقم الأمر ← ترتيب البند
    return list.sort((a, b) => {
      const wa = getWO(a), wb = getWO(b);
      const pa = PRIORITY_RANK[wa?.priority ?? "متوسطة"] ?? 2, pb = PRIORITY_RANK[wb?.priority ?? "متوسطة"] ?? 2;
      if (pa !== pb) return pa - pb;
      const da = wa?.expected_delivery ?? "9999", db = wb?.expected_delivery ?? "9999";
      if (da !== db) return da < db ? -1 : 1;
      const na = wa?.wo_number ?? "", nb = wb?.wo_number ?? "";
      if (na !== nb) return na.localeCompare(nb);
      return (a.sort_order ?? a.id) - (b.sort_order ?? b.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, doneMap, view, showWaiting, noRouteOnly, woFilter, materialFilter, thicknessFilter, lateOnly, search]);

  // تجميع بالخامة + السُمك (الترتيب جوه كل مجموعة محفوظ)
  const groups = useMemo(() => {
    if (!grouped) return [{ key: "", label: "", items: visible }];
    const map = new Map<string, QueueItem[]>();
    visible.forEach(it => {
      const k = `${it.sheet_steel ?? "—"} · ${it.thickness ?? "—"}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    });
    return Array.from(map.entries()).map(([k, list]) => ({ key: k, label: k, items: list }));
  }, [visible, grouped]);

  const piecesFor = (it: QueueItem) =>
    view === "total" ? remainingTotal(it) : stageInfo(it, view)?.available ?? 0;

  const filtersActive = !!search || woFilter !== "الكل" || materialFilter !== "الكل" || thicknessFilter !== "الكل"
    || lateOnly || (view === "total" && noRouteOnly);
  const clearFilters = () => {
    setSearch(""); setWoFilter("الكل"); setMaterialFilter("الكل"); setThicknessFilter("الكل");
    setLateOnly(false); setNoRouteOnly(false);
  };

  /* ─────────── التحديد المتعدد ─────────── */

  const toggleSelect = (id: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisibleSelected = visible.length > 0 && visible.every(it => selected.has(it.id));
  const someVisibleSelected = visible.some(it => selected.has(it.id));
  const toggleSelectAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map(it => it.id)));

  /* ─────────── تسجيل الإنتاج ─────────── */

  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);
  const [logQty, setLogQty] = useState("");
  const [logMachineId, setLogMachineId] = useState("");
  const [logNote, setLogNote] = useState("");
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState("");

  const logAvailable = logTarget
    ? logTarget.mode === "stage" ? stageInfo(logTarget.item, logTarget.stage)?.available ?? 0 : remainingTotal(logTarget.item)
    : 0;

  const machinesForLog = machines.filter(m =>
    m.active && (logTarget?.mode !== "stage" || !m.stage || m.stage === logTarget.stage));

  const openLog = (t: LogTarget) => {
    setLogTarget(t); setLogQty(""); setLogNote(""); setLogError("");
    // لو فيه مكنة واحدة بس للمرحلة نختارها تلقائي
    const ms = machines.filter(m => m.active && (t.mode !== "stage" || !m.stage || m.stage === t.stage));
    setLogMachineId(ms.length === 1 ? String(ms[0].id) : "");
  };

  const submitLog = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!logTarget || logging) return;
    const q = parseFloat(logQty);
    if (!q || q <= 0) { setLogError("أدخل كمية صحيحة"); return; }
    if (q > logAvailable) { setLogError(`الكمية أكبر من المتاح (${fmt(logAvailable)})`); return; }
    if (machineRequired && !logMachineId) { setLogError("اختيار المكنة إجباري"); return; }
    setLogging(true); setLogError("");
    const machineId = logMachineId ? parseInt(logMachineId) : null;
    const note = logNote.trim() || null;
    const itemId = logTarget.item.id;
    const doneMsg = logTarget.mode === "stage"
      ? `تم تسجيل ${fmt(q)} قطعة في ${STAGE_LABEL[logTarget.stage]}`
      : `تم تسجيل ${fmt(q)} قطعة صاج`;

    if (logTarget.mode === "stage") {
      const stage = logTarget.stage;
      const { data, error } = await supabase.rpc("log_sheet_substage", {
        p_item_id: itemId, p_stage: stage, p_qty: q, p_machine_id: machineId, p_note: note,
      });
      setLogging(false);
      if (error) { setLogError(error.message); return; }
      const res = data as { qty_done: number; qty_sheet: number };
      applySubstage(itemId, stage, Number(res.qty_done));
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, qty_sheet: Number(res.qty_sheet) } : it));
      setLockedIds(prev => new Set(prev).add(itemId));
    } else {
      const { error } = await supabase.rpc("log_production", {
        p_item_id: itemId, p_stage: "sheet", p_qty: q, p_machine_id: machineId, p_note: note,
      });
      setLogging(false);
      if (error) { setLogError(error.message); return; }
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, qty_sheet: (it.qty_sheet ?? 0) + q } : it));
    }
    setLogTarget(null);
    toast.success(doneMsg);
  };

  const applySubstage = (itemId: number, stage: string, qtyDone: number) =>
    setSubstages(prev => {
      const idx = prev.findIndex(x => x.production_item_id === itemId && x.stage === stage);
      if (idx >= 0) {
        if (prev[idx].qty_done === qtyDone) return prev;
        const next = [...prev]; next[idx] = { ...next[idx], qty_done: qtyDone }; return next;
      }
      return [...prev, { production_item_id: itemId, stage, qty_done: qtyDone }];
    });

  /* ─────────── تحديد المسار ─────────── */

  const [routeTargets, setRouteTargets] = useState<number[] | null>(null);
  const [routeDraft, setRouteDraft] = useState<Set<Stage>>(new Set());
  const [routeSaving, setRouteSaving] = useState(false);
  const [routeMsg, setRouteMsg] = useState("");      // بنود اتسابت (بدأ التسجيل عليها)
  const [routeError, setRouteError] = useState("");

  const openRoute = (ids: number[]) => {
    const first = items.find(it => it.id === ids[0]);
    setRouteDraft(new Set(ids.length === 1 && first ? routeOf(first) : []));
    setRouteTargets(ids); setRouteMsg(""); setRouteError("");
  };

  const saveRoute = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!routeTargets || routeSaving) return;
    setRouteSaving(true); setRouteMsg(""); setRouteError("");
    const route = STAGES.map(s => s.key).filter(k => routeDraft.has(k));
    const { data, error } = await supabase.rpc("set_sheet_route", { p_item_ids: routeTargets, p_route: route });
    if (error) { setRouteSaving(false); setRouteError(error.message); return; }
    const res = data as { route: Stage[]; updated: number[]; skipped: { id: number; description: string }[] };
    const updated = new Set(res.updated);
    setItems(prev => prev.map(it => updated.has(it.id) ? { ...it, sheet_route: res.route } : it));

    // العدادات اتظبطت في الداتابيز — نجيبها تاني
    if (res.updated.length) {
      const { data: subs } = await supabase.from("wo_item_substages")
        .select("id, production_item_id, stage, qty_done").in("production_item_id", res.updated);
      setSubstages(prev => [...prev.filter(s => !updated.has(s.production_item_id)), ...(subs ?? [])]);
    }
    setRouteSaving(false);
    if (res.skipped.length) {
      setRouteMsg(`اتحدد المسار لـ ${res.updated.length} بند. ${res.skipped.length} بند اتسابوا لأنهم بدأ التسجيل عليهم: ${res.skipped.map(s => s.description).join("، ")}`);
    } else {
      setRouteTargets(null);
      toast.success("تم حفظ المسار");
    }
    setSelected(new Set());
  };

  /* ─────────── إدارة المكن ─────────── */

  const [machinesOpen, setMachinesOpen] = useState(false);
  const [newMachineName, setNewMachineName] = useState("");
  const [newMachineStage, setNewMachineStage] = useState<"" | Stage>("");
  const [addingMachine, setAddingMachine] = useState(false);

  const addMachine = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMachineName.trim() || addingMachine) return;
    setAddingMachine(true);
    const { data, error } = await supabase.from("machines")
      .insert({ name: newMachineName.trim(), department: "SHEET", stage: newMachineStage || null })
      .select("id, name, department, notes, active, stage").single();
    setAddingMachine(false);
    if (error) { toast.error(error.message); return; }
    setMachines(prev => [...prev, data as Machine].sort((a, b) => a.name.localeCompare(b.name)));
    setNewMachineName(""); setNewMachineStage("");
    toast.success("تمت إضافة المكنة");
  };

  const updateMachine = async (m: Machine, patch: Partial<Machine>) => {
    const { error } = await supabase.from("machines").update(patch).eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    setMachines(prev => prev.map(x => x.id === m.id ? { ...x, ...patch } : x));
  };

  /* ─────────── التحديث اللحظي ─────────── */

  useEffect(() => {
    const channel = supabase
      .channel("sheet-monitoring")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wo_production_items" }, payload => {
        const n = payload.new as Partial<QueueItem> & { id: number };
        setItems(prev => prev.map(it => it.id === n.id ? {
          ...it,
          qty: n.qty ?? it.qty, qty_sheet: n.qty_sheet ?? it.qty_sheet, sheet_route: n.sheet_route ?? it.sheet_route,
          description: n.description ?? it.description, part_no: n.part_no ?? it.part_no,
          sheet_steel: n.sheet_steel ?? it.sheet_steel, thickness: n.thickness ?? it.thickness,
        } : it));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wo_production_items" }, () => {
        setNewItemsPending(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "wo_item_substages" }, payload => {
        if (payload.eventType === "DELETE") return;
        const n = payload.new as Substage;
        applySubstage(n.production_item_id, n.stage, Number(n.qty_done) || 0);
      })
      .subscribe(status => setLive(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, []);

  /* ═══════════════════════ العرض ═══════════════════════ */

  const viewLabel = view === "total" ? "الإجمالي" : STAGE_LABEL[view];
  const colCount = view === "total" ? 11 : 10;
  const visiblePieces = visible.reduce((a, it) => a + piecesFor(it), 0);
  const routeSingle = routeTargets && routeTargets.length === 1 ? items.find(it => it.id === routeTargets[0]) : undefined;

  const emptyAction = filtersActive
    ? <button type="button" onClick={clearFilters} className="eg-btn-ghost eg-btn-sm">مسح الفلاتر</button>
    : view !== "total" && !showWaiting && stats.perStage[view].waiting > 0
      ? (
        <button type="button" onClick={() => setShowWaiting(true)} className="eg-btn-ghost eg-btn-sm">
          <Hourglass className="size-3.5" />عرض المنتظر مرحلة سابقة
        </button>
      )
      : undefined;

  return (
    <Page width="full">
      <PageHeader
        title="متابعة قسم الصاج"
        icon={Scissors}
        meta={<LiveBadge live={live} hint={live ? "متصل — التحديث لحظي" : "غير متصل بالتحديث اللحظي"} />}
        subtitle="بنش ← مقص ← تني ← لحام — كل مرحلة بتشتغل على اللي خلص من المرحلة اللي قبلها"
        actions={
          <button type="button" onClick={() => setMachinesOpen(true)} className="eg-btn-ghost eg-btn-sm">
            <Settings className="size-3.5" />إدارة المكن
          </button>
        }
      />

      <PageBody>
        {newItemsPending && (
          <div role="status" className="eg-card flex animate-fade-in flex-wrap items-center gap-3 border-accent/40 bg-accent/[0.04] !py-3">
            <Info className="size-4 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 text-sm text-text">فيه بنود جديدة اتضافت لقائمة الإنتاج</span>
            <button type="button" onClick={() => window.location.reload()} className="eg-btn-primary eg-btn-sm">
              <RefreshCw className="size-3.5" />تحديث
            </button>
          </div>
        )}

        {/* كروت المراحل — كل كارت بيغيّر العرض */}
        <div className="eg-stagger grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
          <StageCard
            className="col-span-2 lg:col-span-4 xl:col-span-2"
            active={view === "total"} onClick={() => setView("total")}
            title="الإجمالي" main={stats.total.pieces} mainLabel="قطعة متبقية"
            second={stats.total.items} secondLabel="بند متبقي"
            extra={stats.total.noRoute > 0 ? (
              <span className="inline-flex items-center gap-1 font-medium text-warning">
                <AlertTriangle className="size-3" />
                <span className="tabular-nums">{stats.total.noRoute}</span> بدون مسار
              </span>
            ) : null}
          />
          {STAGES.map(s => {
            const st = stats.perStage[s.key];
            return (
              <StageCard key={s.key} active={view === s.key} onClick={() => setView(s.key)}
                title={s.label} main={st.available} mainLabel="قطعة جاهزة للشغل"
                sub={`${st.items} بند`}
                extra={st.waiting > 0 ? (
                  <span className="inline-flex items-center gap-1 text-subtext">
                    <Hourglass className="size-3" />
                    <span className="tabular-nums">{fmt(st.waiting)}</span> منتظرة مرحلة سابقة
                  </span>
                ) : null}
              />
            );
          })}
        </div>

        {/* الجدول + شريط الفلاتر */}
        <div className="eg-card overflow-hidden !p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2.5">
            <SearchInput value={search} onChange={setSearch} placeholder="بحث بالوصف أو رقم القطعة أو الأمر" className="w-full sm:w-64" />
            <select value={woFilter} onChange={e => setWoFilter(e.target.value)}
              aria-label="أمر الشغل" title="أمر الشغل" className="eg-select eg-input-sm w-36">
              <option value="الكل">كل الأوامر</option>
              {woOptions.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <select value={materialFilter} onChange={e => setMaterialFilter(e.target.value)}
              aria-label="الخامة" title="الخامة" className="eg-select eg-input-sm w-32">
              <option value="الكل">كل الخامات</option>
              {materialOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={thicknessFilter} onChange={e => setThicknessFilter(e.target.value)}
              aria-label="السُمك" title="السُمك" className="eg-select eg-input-sm w-28">
              <option value="الكل">كل السُمك</option>
              {thicknessOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <span aria-hidden className="mx-0.5 hidden h-5 w-px bg-border sm:block" />
            <FilterChip active={lateOnly} onClick={() => setLateOnly(v => !v)} count={stats.total.late || undefined} tone="danger">
              <AlertTriangle className="size-3.5" />المتأخر فقط
            </FilterChip>
            <FilterChip active={grouped} onClick={() => setGroupOverride(!grouped)}>
              <Layers className="size-3.5" />تجميع بالخامة والسُمك
            </FilterChip>
            {view === "total"
              ? <FilterChip active={noRouteOnly} onClick={() => setNoRouteOnly(v => !v)}>بدون مسار فقط</FilterChip>
              : <FilterChip active={showWaiting} onClick={() => setShowWaiting(v => !v)}>عرض المنتظر مرحلة سابقة</FilterChip>}
            {visible.length > 0 && (
              <span className="ms-auto whitespace-nowrap text-xs tabular-nums text-subtext">
                {visible.length} بند · {fmt(visiblePieces)} قطعة
              </span>
            )}
          </div>

          {visible.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="eg-table eg-table-compact min-w-[960px]">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="تحديد الكل"
                        ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }} />
                    </th>
                    <th className="w-40">أمر الشغل</th>
                    <th>الوصف</th>
                    <th className="w-28">Part No.</th>
                    <th className="w-24">الخامة</th>
                    <th className="w-20">السُمك</th>
                    <th className="w-20">المطلوب</th>
                    {view === "total" ? <>
                      <th className="w-20">خلص صاج</th>
                      <th className="w-20">المتبقي</th>
                    </> : (
                      <th className="w-24">المتاح هنا</th>
                    )}
                    <th className="w-56">المسار</th>
                    <th className="w-32">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <Fragment key={g.key || "all"}>
                      {grouped && (
                        <tr className="bg-card2/60">
                          <td colSpan={colCount} className="!py-2">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text">
                                <Layers className="size-3.5 text-muted" />{g.label}
                              </span>
                              <span className="text-[11px] tabular-nums text-subtext">
                                {g.items.length} بند · {fmt(g.items.reduce((a, it) => a + piecesFor(it), 0))} قطعة
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {g.items.map(it => {
                        const wo = getWO(it);
                        const late = isLate(it);
                        const route = routeOf(it);
                        const info = view !== "total" ? stageInfo(it, view) : null;
                        const waitingOnly = !!info && info.available <= 0;
                        const isSelected = selected.has(it.id);
                        return (
                          <tr key={it.id} className={cn(isSelected && "bg-accent/[0.06]", waitingOnly && "opacity-50")}>
                            <td>
                              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)}
                                aria-label={`تحديد ${it.description}`} />
                            </td>
                            <td><WoCell wo={wo} late={late} /></td>
                            <td className="whitespace-normal break-words text-text">{it.description}</td>
                            <td className="font-mono text-xs text-subtext">{it.part_no ?? "—"}</td>
                            <td>{it.sheet_steel ?? "—"}</td>
                            <td className="tabular-nums">{it.thickness ?? "—"}</td>
                            <td className="tabular-nums text-subtext">{fmt(it.qty)}</td>
                            {view === "total" ? <>
                              <td className="tabular-nums font-medium text-text">{fmt(it.qty_sheet ?? 0)}</td>
                              <td className="tabular-nums font-bold text-warning">{fmt(remainingTotal(it))}</td>
                            </> : (
                              <td className="tabular-nums">
                                <span className={cn("font-bold", info!.available > 0 ? "text-warning" : "text-subtext")}>{fmt(info!.available)}</span>
                                {info!.waiting > 0 && info!.prevStage && (
                                  <div className="text-[11px] text-subtext">+{fmt(info!.waiting)} في {STAGE_LABEL[info!.prevStage]}</div>
                                )}
                              </td>
                            )}
                            <td>
                              <RouteChips route={route} qty={it.qty} doneOf={s => doneOf(it.id, s)} current={view !== "total" ? view : null} />
                            </td>
                            <td>
                              <div className="flex items-center gap-1.5">
                                {view !== "total" ? (
                                  <button type="button" onClick={() => openLog({ item: it, mode: "stage", stage: view })}
                                    disabled={waitingOnly} className="eg-btn-primary eg-btn-xs">
                                    تسجيل {STAGE_LABEL[view]}
                                  </button>
                                ) : route.length === 0 ? (
                                  <Tooltip content="بند بدون مسار — بيتسجل على الإجمالي مباشرة">
                                    <button type="button" onClick={() => openLog({ item: it, mode: "direct" })} className="eg-btn-ghost eg-btn-xs">
                                      تسجيل مباشر
                                    </button>
                                  </Tooltip>
                                ) : null}
                                {!lockedIds.has(it.id) && (
                                  <Tooltip content="تحديد المسار">
                                    <button type="button" onClick={() => openRoute([it.id])} aria-label="تحديد المسار" className="eg-icon-btn">
                                      <Route className="size-3.5" />
                                    </button>
                                  </Tooltip>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              message={view === "total" ? "لا توجد بنود متبقية مطابقة للفلتر" : `مفيش شغل جاهز في ${viewLabel} دلوقتي`}
              action={emptyAction}
            />
          )}
        </div>

        {/* شريط التحديد — بيفضل ظاهر تحت الشاشة وإنت بتختار */}
        {selected.size > 0 && (
          <div className="eg-card sticky bottom-4 z-10 mx-auto flex w-fit max-w-full animate-fade-up flex-wrap items-center gap-x-4 gap-y-2 !p-3 shadow-pop">
            <span className="text-sm text-text">
              تم تحديد <span className="font-bold tabular-nums">{selected.size}</span> بند
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => openRoute(Array.from(selected))} className="eg-btn-primary eg-btn-sm">
                <Route className="size-3.5" />تحديد المسار
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="eg-btn-ghost eg-btn-sm">إلغاء التحديد</button>
            </div>
          </div>
        )}
      </PageBody>

      {/* ── مودال التسجيل ── */}
      <Modal open={!!logTarget} onClose={() => setLogTarget(null)}
        title={logTarget?.mode === "stage" ? `تسجيل ${STAGE_LABEL[logTarget.stage]}` : "تسجيل صاج مباشر"}>
        {logTarget && (
          <form noValidate onSubmit={submitLog} className="space-y-4">
            <div className="space-y-2.5 rounded-lg border border-border/70 bg-card2/60 p-3">
              <p className="text-sm font-medium leading-6 text-text">{logTarget.item.description}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtext">
                <span>أمر الشغل: <span className="font-mono text-text">{getWO(logTarget.item)?.wo_number ?? "—"}</span></span>
                <span>المطلوب: <span className="tabular-nums text-text">{fmt(logTarget.item.qty)}</span></span>
                <span>المتاح للتسجيل: <b className="tabular-nums text-warning">{fmt(logAvailable)}</b></span>
              </div>
              {logTarget.mode === "stage" && (
                <RouteChips route={routeOf(logTarget.item)} qty={logTarget.item.qty}
                  doneOf={s => doneOf(logTarget.item.id, s)} current={logTarget.stage} />
              )}
              {logTarget.mode === "stage" && routeOf(logTarget.item)[routeOf(logTarget.item).length - 1] === logTarget.stage && (
                <p className="flex items-start gap-1.5 text-[11px] leading-5 text-success">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                  دي آخر مرحلة في المسار — الكمية هتتضاف لإجمالي الصاج وتتاح للدهان.
                </p>
              )}
            </div>

            <Field label="الكمية" required htmlFor="sheet-log-qty">
              <div className="flex gap-2">
                <input id="sheet-log-qty" type="number" inputMode="decimal" min="0.01" step="any" max={logAvailable}
                  value={logQty} onChange={e => setLogQty(e.target.value)} className="eg-input min-w-0 flex-1" autoFocus />
                <button type="button" onClick={() => setLogQty(String(logAvailable))} className="eg-btn-ghost shrink-0">
                  الكل (<span className="tabular-nums">{fmt(logAvailable)}</span>)
                </button>
              </div>
            </Field>

            <Field label="المكنة" required={machineRequired} htmlFor="sheet-log-machine"
              hint={machinesForLog.length === 0
                ? `مفيش مكن مسجلة ${logTarget.mode === "stage" ? `لمرحلة ${STAGE_LABEL[logTarget.stage]}` : "لقسم الصاج"} — أضفها من «إدارة المكن»`
                : undefined}>
              <select id="sheet-log-machine" value={logMachineId} onChange={e => setLogMachineId(e.target.value)} className="eg-select">
                <option value="">— بدون تحديد —</option>
                {machinesForLog.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>

            <Field label="ملاحظة" htmlFor="sheet-log-note">
              <input id="sheet-log-note" value={logNote} onChange={e => setLogNote(e.target.value)} className="eg-input" />
            </Field>

            <FormError>{logError}</FormError>
            <button type="submit" disabled={logging || !logQty} className="eg-btn-success w-full">
              {logging ? <Spinner /> : <Check className="size-4" />}
              {logging ? "جاري التسجيل..." : "تأكيد التسجيل"}
            </button>
          </form>
        )}
      </Modal>

      {/* ── مودال المسار ── */}
      <Modal open={!!routeTargets} onClose={() => setRouteTargets(null)}
        title={routeTargets && routeTargets.length > 1 ? `مسار ${routeTargets.length} بند` : "مسار التصنيع"}
        description={routeSingle?.description}>
        <form noValidate onSubmit={saveRoute} className="space-y-4">
          <p className="text-xs leading-5 text-subtext">اختار المراحل اللي البند هيعدي عليها. الترتيب ثابت: بنش ← مقص ← تني ← لحام.</p>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-1.5">
            {STAGES.map((s, i) => {
              const on = routeDraft.has(s.key);
              return (
                <Fragment key={s.key}>
                  {i > 0 && <ChevronLeft aria-hidden className="hidden size-4 shrink-0 text-muted sm:block" />}
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setRouteDraft(prev => { const n = new Set(prev); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n; })}
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors duration-150 sm:min-w-0 sm:flex-1",
                      on
                        ? "border-accent/60 bg-accent/10 text-accent"
                        : "border-border bg-card2 text-subtext hover:border-border-strong hover:text-text",
                    )}
                  >
                    {on ? <CheckCircle2 className="size-4 shrink-0" /> : <Circle className="size-4 shrink-0 text-muted" />}
                    {s.label}
                  </button>
                </Fragment>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setRouteDraft(new Set(STAGES.map(s => s.key)))} className="eg-btn-ghost eg-btn-xs">
              كل المراحل
            </button>
            <button type="button" onClick={() => setRouteDraft(new Set())} className="eg-btn-subtle eg-btn-xs">
              بدون مسار (تسجيل مباشر)
            </button>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] leading-5 text-subtext">
            <Lock className="mt-0.5 size-3 shrink-0 text-muted" />
            بعد أول تسجيل على أي مرحلة، المسار بيتقفل علشان الأرقام متتلخبطش.
          </p>

          {routeMsg && (
            <p role="status" className="animate-fade-in rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
              {routeMsg}
            </p>
          )}
          <FormError>{routeError}</FormError>

          <button type="submit" disabled={routeSaving} className="eg-btn-primary w-full">
            {routeSaving ? <Spinner /> : <Route className="size-4" />}
            {routeSaving ? "جاري الحفظ..." : "حفظ المسار"}
          </button>
        </form>
      </Modal>

      {/* ── مودال المكن ── */}
      <Modal open={machinesOpen} onClose={() => setMachinesOpen(false)} title="إدارة مكن الصاج">
        <div className="space-y-4">
          <form onSubmit={addMachine} className="flex flex-col gap-2 sm:flex-row">
            <input value={newMachineName} onChange={e => setNewMachineName(e.target.value)}
              aria-label="اسم المكنة الجديدة" className="eg-input min-w-0 sm:flex-1" placeholder="اسم المكنة الجديدة" />
            <div className="flex gap-2">
              <select value={newMachineStage} onChange={e => setNewMachineStage(e.target.value as "" | Stage)}
                aria-label="مرحلة المكنة" className="eg-select min-w-0 flex-1 sm:w-32 sm:flex-none">
                <option value="">كل المراحل</option>
                {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <button type="submit" disabled={addingMachine || !newMachineName.trim()} className="eg-btn-primary shrink-0">
                {addingMachine ? <Spinner /> : <Plus className="size-4" />}إضافة
              </button>
            </div>
          </form>

          {machines.length > 0 ? (
            <div className="space-y-1.5">
              {machines.map(m => (
                <div key={m.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card2/50 px-3 py-2">
                  <span className={cn("min-w-0 flex-1 truncate text-sm", m.active ? "text-text" : "text-subtext line-through")}>{m.name}</span>
                  <select value={m.stage ?? ""} onChange={e => updateMachine(m, { stage: (e.target.value || null) as Stage | null })}
                    aria-label={`مرحلة ${m.name}`} className="eg-select eg-input-sm w-28">
                    <option value="">كل المراحل</option>
                    {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  <button type="button" onClick={() => updateMachine(m, { active: !m.active })}
                    className={cn(m.active ? "eg-btn-danger-soft" : "eg-btn-ghost", "eg-btn-xs w-14")}>
                    {m.active ? "تعطيل" : "تفعيل"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={Settings} message="لا توجد مكن مسجلة بعد" />
          )}
        </div>
      </Modal>
    </Page>
  );
}

/* ═══════════════════════ مكونات صغيرة ═══════════════════════ */

// مؤشر الاتصال بالتحديث اللحظي
function LiveBadge({ live, hint }: { live: boolean; hint: string }) {
  return (
    <Tooltip content={hint} side="bottom">
      <span className={cn("eg-badge rounded-full", live ? "tone-success" : "tone-neutral")}>
        <span aria-hidden className="relative inline-flex size-1.5 shrink-0">
          {live && <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60 [animation-duration:1.8s]" />}
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
        {live ? "مباشر" : "غير متصل"}
      </span>
    </Tooltip>
  );
}

function StageCard({ active, onClick, title, main, mainLabel, second, secondLabel, sub, extra, className }: {
  active: boolean; onClick: () => void; title: string; main: number; mainLabel: string;
  second?: number; secondLabel?: string; sub?: string; extra?: React.ReactNode; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "eg-card flex w-full flex-col !p-4 text-start",
        // الرفعة بـ translate (مش transform) علشان حركة دخول eg-stagger مثبّتة الـ transform
        "cursor-pointer transition-[border-color,background-color,translate] duration-150 hover:border-border-strong hover:bg-card2/40 hover:[translate:0_-1px] active:[translate:none]",
        active && "!border-accent/50 bg-accent/[0.04] ring-1 ring-accent/30 hover:bg-accent/[0.06]",
        className,
      )}
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-x-2">
        <span className={cn("text-sm font-semibold leading-5", active ? "text-accent" : "text-text")}>{title}</span>
        {sub && <span className="text-[11px] leading-5 tabular-nums text-subtext">{sub}</span>}
      </div>
      <div className="mt-2 flex items-end gap-4">
        <div className="min-w-0">
          <div className={cn("text-2xl font-bold leading-8 tracking-tight tabular-nums", main > 0 ? "text-warning" : "text-subtext")}>
            {fmt(main)}
          </div>
          <div className="text-[11px] leading-4 text-subtext">{mainLabel}</div>
        </div>
        {second !== undefined && (
          <div className="min-w-0 border-s border-border/70 ps-4">
            <div className={cn("text-2xl font-bold leading-8 tracking-tight tabular-nums", second > 0 ? "text-text" : "text-subtext")}>
              {fmt(second)}
            </div>
            <div className="text-[11px] leading-4 text-subtext">{secondLabel}</div>
          </div>
        )}
      </div>
      {extra && <div className="mt-auto pt-2.5 text-[11px] leading-4">{extra}</div>}
    </button>
  );
}

// خلية أمر الشغل: الرقم + الأولوية + تاريخ التسليم (أحمر لو متأخر)
function WoCell({ wo, late }: { wo?: WO; late: boolean }) {
  return (
    <>
      <div className="font-mono text-[13px] font-semibold text-accent">{wo?.wo_number ?? "—"}</div>
      {(wo?.priority || wo?.expected_delivery) && (
        <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap">
          {wo?.priority && <Badge label={wo.priority} dot={false} />}
          {wo?.expected_delivery && (
            <span className={cn("text-[11px]", late ? "font-semibold text-danger" : "text-subtext")}>
              {late ? "متأخر · " : ""}<span className="tabular-nums">{wo.expected_delivery}</span>
            </span>
          )}
        </div>
      )}
    </>
  );
}

function RouteChips({ route, qty, doneOf, current }: {
  route: Stage[]; qty: number; doneOf: (s: Stage) => number; current: Stage | null;
}) {
  if (route.length === 0) return <Badge label="بدون مسار" tone="warning" dot={false} />;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {route.map((s, i) => {
        const done = doneOf(s);
        const full = done >= qty;
        const tone = full
          ? "bg-success/10 text-success ring-success/25"
          : done > 0 ? "bg-accent/10 text-accent ring-accent/25" : "bg-card2 text-subtext ring-border";
        return (
          <Fragment key={s}>
            {i > 0 && <ChevronLeft aria-hidden className="size-3 shrink-0 text-muted" />}
            <span
              aria-current={current === s ? "step" : undefined}
              className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] leading-4 ring-1 ring-inset",
                tone,
                current === s && "font-semibold ring-accent",
              )}
            >
              {STAGE_LABEL[s]}
              <span className="tabular-nums">{fmt(done)}/{fmt(qty)}</span>
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
