"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { Search, Settings, Plus, Route, Layers, AlertTriangle, Radio, RefreshCw, X } from "lucide-react";

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

const PRIORITY_RANK: Record<string, number> = { "عاجلة": 0, "عالية": 1, "متوسطة": 2, "منخفضة": 3 };
const PRIORITY_STYLE: Record<string, string> = {
  "عاجلة": "bg-danger/15 text-danger",
  "عالية": "bg-warning/15 text-warning",
  "متوسطة": "bg-accent/15 text-accent",
  "منخفضة": "bg-card2 text-subtext",
};

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

  /* ─────────── التحديد المتعدد ─────────── */

  const toggleSelect = (id: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisibleSelected = visible.length > 0 && visible.every(it => selected.has(it.id));
  const toggleSelectAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map(it => it.id)));

  /* ─────────── تسجيل الإنتاج ─────────── */

  type LogTarget = { item: QueueItem; mode: "stage"; stage: Stage } | { item: QueueItem; mode: "direct" };
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

  const submitLog = async () => {
    if (!logTarget) return;
    const q = parseFloat(logQty);
    if (!q || q <= 0) { setLogError("أدخل كمية صحيحة"); return; }
    if (q > logAvailable) { setLogError(`الكمية أكبر من المتاح (${fmt(logAvailable)})`); return; }
    if (machineRequired && !logMachineId) { setLogError("اختيار المكنة إجباري"); return; }
    setLogging(true); setLogError("");
    const machineId = logMachineId ? parseInt(logMachineId) : null;
    const note = logNote.trim() || null;
    const itemId = logTarget.item.id;

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
  const [routeMsg, setRouteMsg] = useState("");

  const openRoute = (ids: number[]) => {
    const first = items.find(it => it.id === ids[0]);
    setRouteDraft(new Set(ids.length === 1 && first ? routeOf(first) : []));
    setRouteTargets(ids); setRouteMsg("");
  };

  const saveRoute = async () => {
    if (!routeTargets) return;
    setRouteSaving(true); setRouteMsg("");
    const route = STAGES.map(s => s.key).filter(k => routeDraft.has(k));
    const { data, error } = await supabase.rpc("set_sheet_route", { p_item_ids: routeTargets, p_route: route });
    if (error) { setRouteSaving(false); setRouteMsg(error.message); return; }
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
    }
    setSelected(new Set());
  };

  /* ─────────── إدارة المكن ─────────── */

  const [machinesOpen, setMachinesOpen] = useState(false);
  const [newMachineName, setNewMachineName] = useState("");
  const [newMachineStage, setNewMachineStage] = useState<"" | Stage>("");
  const [addingMachine, setAddingMachine] = useState(false);

  const addMachine = async () => {
    if (!newMachineName.trim()) return;
    setAddingMachine(true);
    const { data, error } = await supabase.from("machines")
      .insert({ name: newMachineName.trim(), department: "SHEET", stage: newMachineStage || null })
      .select("id, name, department, notes, active, stage").single();
    setAddingMachine(false);
    if (error) { alert(error.message); return; }
    setMachines(prev => [...prev, data as Machine].sort((a, b) => a.name.localeCompare(b.name)));
    setNewMachineName(""); setNewMachineStage("");
  };

  const updateMachine = async (m: Machine, patch: Partial<Machine>) => {
    const { error } = await supabase.from("machines").update(patch).eq("id", m.id);
    if (error) { alert(error.message); return; }
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

  return (
    <div className="p-4 md:p-6 w-full mx-auto space-y-4">
      {/* الهيدر */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text flex items-center gap-2">
            🛠️ متابعة قسم الصاج
            <span title={live ? "متصل — التحديث لحظي" : "غير متصل بالتحديث اللحظي"}
              className={`inline-flex items-center gap-1 text-[11px] font-normal px-2 py-0.5 rounded-full ${live ? "bg-success/15 text-success" : "bg-card2 text-subtext"}`}>
              <Radio className="w-3 h-3" />{live ? "مباشر" : "غير متصل"}
            </span>
          </h1>
          <p className="text-sm text-subtext mt-0.5">بنش ← مقص ← تني ← لحام — كل مرحلة بتشتغل على اللي خلص من المرحلة اللي قبلها</p>
        </div>
        <button onClick={() => setMachinesOpen(true)} className="eg-btn-ghost text-sm">
          <Settings className="w-4 h-4" />إدارة المكن
        </button>
      </div>

      {newItemsPending && (
        <div className="eg-card !py-3 flex items-center justify-between border-accent/40">
          <span className="text-sm text-text">فيه بنود جديدة اتضافت لقائمة الإنتاج</span>
          <button onClick={() => window.location.reload()} className="eg-btn-primary text-xs !py-1.5">
            <RefreshCw className="w-3.5 h-3.5" />تحديث
          </button>
        </div>
      )}

      {/* كروت المراحل */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StageCard active={view === "total"} onClick={() => setView("total")}
                    title="الإجمالي" main={stats.total.pieces} mainLabel="قطعة متبقية"
          second={stats.total.items} secondLabel="بند متبقي"
          extra={stats.total.noRoute > 0 ? <span className="text-warning">{stats.total.noRoute} بدون مسار</span> : null} />
        {STAGES.map(s => {
          const st = stats.perStage[s.key];
          return (
            <StageCard key={s.key} active={view === s.key} onClick={() => setView(s.key)}
              title={s.label} main={st.available} mainLabel="قطعة جاهزة للشغل"
              sub={`${st.items} بند`}
              extra={st.waiting > 0 ? <span className="text-subtext">{fmt(st.waiting)} منتظرة مرحلة سابقة</span> : null} />
          );
        })}
      </div>

      {/* الفلاتر */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="eg-input pr-9 w-56" placeholder="بحث بالوصف أو رقم القطعة أو الأمر" />
        </div>
        <select value={woFilter} onChange={e => setWoFilter(e.target.value)} className="eg-select w-40" title="أمر الشغل">
          <option value="الكل">كل الأوامر</option>
          {woOptions.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <select value={materialFilter} onChange={e => setMaterialFilter(e.target.value)} className="eg-select w-36" title="الخامة">
          <option value="الكل">كل الخامات</option>
          {materialOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={thicknessFilter} onChange={e => setThicknessFilter(e.target.value)} className="eg-select w-32" title="السُمك">
          <option value="الكل">كل السُمك</option>
          {thicknessOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <Chip on={lateOnly} onClick={() => setLateOnly(v => !v)}>
          <AlertTriangle className="w-3.5 h-3.5" />المتأخر فقط{stats.total.late ? ` (${stats.total.late})` : ""}
        </Chip>
        <Chip on={grouped} onClick={() => setGroupOverride(!grouped)}>
          <Layers className="w-3.5 h-3.5" />تجميع بالخامة والسُمك
        </Chip>
        {view === "total"
          ? <Chip on={noRouteOnly} onClick={() => setNoRouteOnly(v => !v)}>بدون مسار فقط</Chip>
          : <Chip on={showWaiting} onClick={() => setShowWaiting(v => !v)}>عرض المنتظر مرحلة سابقة</Chip>}
      </div>

      {/* شريط التحديد */}
      {selected.size > 0 && (
        <div className="eg-card !py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-text">تم تحديد {selected.size} بند</span>
          <div className="flex gap-2">
            <button onClick={() => openRoute(Array.from(selected))} className="eg-btn-primary text-sm !py-1.5">
              <Route className="w-4 h-4" />تحديد المسار
            </button>
            <button onClick={() => setSelected(new Set())} className="eg-btn-ghost text-sm !py-1.5">إلغاء التحديد</button>
          </div>
        </div>
      )}

      {/* الجدول */}
      <div className="eg-card !p-0 overflow-x-auto">
        <table className="eg-table w-full min-w-[960px]">
          <thead><tr>
            <th className="w-10">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="تحديد الكل" />
            </th>
            <th className="w-36">أمر الشغل</th>
            <th>الوصف</th>
            <th className="w-28">Part No.</th>
            <th className="w-24">الخامة</th>
            <th className="w-20">السُمك</th>
            <th className="w-20">المطلوب</th>
            {view === "total" ? <>
              <th className="w-20">خلص صاج</th>
              <th className="w-20">المتبقي</th>
            </> : <>
              <th className="w-24">المتاح هنا</th>
            </>}
            <th className="w-56">المسار</th>
            <th className="w-32">إجراء</th>
          </tr></thead>
          <tbody>
            {groups.map(g => (
              <Fragment key={g.key || "all"}>
                {grouped && (
                  <tr className="bg-card2/60">
                    <td colSpan={colCount} className="!py-2 text-xs">
                      <span className="font-bold text-text">{g.label}</span>
                      <span className="text-subtext mr-3">
                        {g.items.length} بند — {fmt(g.items.reduce((a, it) => a + piecesFor(it), 0))} قطعة
                      </span>
                    </td>
                  </tr>
                )}
                {g.items.map(it => {
                  const wo = getWO(it);
                  const late = isLate(it);
                  const route = routeOf(it);
                  const info = view !== "total" ? stageInfo(it, view) : null;
                  const waitingOnly = !!info && info.available <= 0;
                  return (
                    <tr key={it.id} className={waitingOnly ? "opacity-50" : ""}>
                      <td><input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleSelect(it.id)} /></td>
                      <td>
                        <div className="font-mono text-accent">{wo?.wo_number ?? "—"}</div>
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {wo?.priority && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${PRIORITY_STYLE[wo.priority] ?? "bg-card2 text-subtext"}`}>{wo.priority}</span>
                          )}
                          {wo?.expected_delivery && (
                            <span className={`text-[10px] ${late ? "text-danger font-bold" : "text-subtext"}`}>
                              {late ? "متأخر · " : ""}{wo.expected_delivery}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-text whitespace-normal break-words">{it.description}</td>
                      <td className="font-mono text-xs">{it.part_no ?? "—"}</td>
                      <td>{it.sheet_steel ?? "—"}</td>
                      <td>{it.thickness ?? "—"}</td>
                      <td>{fmt(it.qty)}</td>
                      {view === "total" ? <>
                        <td className="text-text font-medium">{fmt(it.qty_sheet ?? 0)}</td>
                        <td className="text-warning font-bold">{fmt(remainingTotal(it))}</td>
                      </> : <>
                        <td>
                          <span className={`font-bold ${info!.available > 0 ? "text-warning" : "text-subtext"}`}>{fmt(info!.available)}</span>
                          {info!.waiting > 0 && info!.prevStage && (
                            <div className="text-[10px] text-subtext">+{fmt(info!.waiting)} في {STAGE_LABEL[info!.prevStage]}</div>
                          )}
                        </td>
                      </>}
                      <td><RouteChips route={route} qty={it.qty} doneOf={s => doneOf(it.id, s)} current={view !== "total" ? view : null} /></td>
                      <td>
                        <div className="flex items-center gap-2">
                          {view !== "total" ? (
                            <button onClick={() => openLog({ item: it, mode: "stage", stage: view })}
                              disabled={waitingOnly} className="eg-btn-primary text-xs !py-1.5 disabled:opacity-40">
                              تسجيل {STAGE_LABEL[view]}
                            </button>
                          ) : route.length === 0 ? (
                            <button onClick={() => openLog({ item: it, mode: "direct" })}
                              className="eg-btn-ghost text-xs !py-1.5" title="بند بدون مسار — بيتسجل على الإجمالي مباشرة">
                              تسجيل مباشر
                            </button>
                          ) : null}
                          {!lockedIds.has(it.id) && (
                            <button onClick={() => openRoute([it.id])} className="text-subtext hover:text-accent" title="تحديد المسار">
                              <Route className="w-4 h-4" />
                            </button>
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
        {visible.length === 0 && (
          <EmptyState message={view === "total" ? "لا توجد بنود متبقية مطابقة للفلتر" : `مفيش شغل جاهز في ${viewLabel} دلوقتي`} />
        )}
      </div>

      {/* ── مودال التسجيل ── */}
      <Modal open={!!logTarget} onClose={() => setLogTarget(null)}
        title={logTarget?.mode === "stage" ? `📝 تسجيل ${STAGE_LABEL[logTarget.stage]}` : "📝 تسجيل صاج مباشر"}>
        {logTarget && (
          <div className="space-y-4">
            <div className="bg-card2 rounded-lg p-3 text-sm space-y-2">
              <p className="text-text font-medium">{logTarget.item.description}</p>
              <p className="text-subtext text-xs">
                أمر الشغل: {getWO(logTarget.item)?.wo_number ?? "—"} — المطلوب: {fmt(logTarget.item.qty)} — المتاح للتسجيل: <b className="text-warning">{fmt(logAvailable)}</b>
              </p>
              {logTarget.mode === "stage" && (
                <RouteChips route={routeOf(logTarget.item)} qty={logTarget.item.qty}
                  doneOf={s => doneOf(logTarget.item.id, s)} current={logTarget.stage} />
              )}
              {logTarget.mode === "stage" && routeOf(logTarget.item)[routeOf(logTarget.item).length - 1] === logTarget.stage && (
                <p className="text-[11px] text-success">دي آخر مرحلة في المسار — الكمية هتتضاف لإجمالي الصاج وتتاح للدهان.</p>
              )}
            </div>
            <div>
              <label className="eg-label">الكمية</label>
              <div className="flex gap-2">
                <input type="number" min="0.01" step="any" value={logQty} max={logAvailable}
                  onChange={e => setLogQty(e.target.value)} className="eg-input flex-1" autoFocus
                  onKeyDown={e => e.key === "Enter" && submitLog()} />
                <button onClick={() => setLogQty(String(logAvailable))} className="eg-btn-ghost text-sm">الكل ({fmt(logAvailable)})</button>
              </div>
            </div>
            <div>
              <label className="eg-label">المكنة {machineRequired ? "*" : "(اختياري)"}</label>
              <select value={logMachineId} onChange={e => setLogMachineId(e.target.value)} className="eg-select">
                <option value="">— بدون تحديد —</option>
                {machinesForLog.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {machinesForLog.length === 0 && (
                <p className="text-xs text-subtext mt-1">مفيش مكن مسجلة لـ{logTarget.mode === "stage" ? ` ${STAGE_LABEL[logTarget.stage]}` : "لقسم الصاج"} — أضفها من "إدارة المكن"</p>
              )}
            </div>
            <div>
              <label className="eg-label">ملاحظة (اختياري)</label>
              <input value={logNote} onChange={e => setLogNote(e.target.value)} className="eg-input" />
            </div>
            {logError && <p className="text-sm text-danger">{logError}</p>}
            <button onClick={submitLog} disabled={logging} className="eg-btn-success w-full justify-center">
              {logging ? "جاري التسجيل..." : "✅ تأكيد التسجيل"}
            </button>
          </div>
        )}
      </Modal>

      {/* ── مودال المسار ── */}
      <Modal open={!!routeTargets} onClose={() => setRouteTargets(null)}
        title={routeTargets && routeTargets.length > 1 ? `🧭 مسار ${routeTargets.length} بند` : "🧭 مسار التصنيع"}>
        <div className="space-y-4">
          <p className="text-xs text-subtext">اختار المراحل اللي البند هيعدي عليها. الترتيب ثابت: بنش ← مقص ← تني ← لحام.</p>
          <div className="flex items-center gap-1 flex-wrap">
            {STAGES.map((s, i) => (
              <Fragment key={s.key}>
                {i > 0 && <span className="text-subtext text-xs">←</span>}
                <button
                  onClick={() => setRouteDraft(prev => { const n = new Set(prev); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n; })}
                  className={`px-3 py-2 rounded-lg text-sm border transition-colors ${routeDraft.has(s.key)
                    ? "bg-accent/20 border-accent text-text" : "bg-card2 border-border text-subtext hover:text-text"}`}>
                  {s.label}
                </button>
              </Fragment>
            ))}
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setRouteDraft(new Set(STAGES.map(s => s.key)))} className="text-accent hover:underline">كل المراحل</button>
            <button onClick={() => setRouteDraft(new Set())} className="text-subtext hover:underline">بدون مسار (تسجيل مباشر)</button>
          </div>
          <p className="text-[11px] text-subtext">بعد أول تسجيل على أي مرحلة، المسار بيتقفل علشان الأرقام متتلخبطش.</p>
          {routeMsg && <p className="text-sm text-warning">{routeMsg}</p>}
          <button onClick={saveRoute} disabled={routeSaving} className="eg-btn-primary w-full justify-center">
            {routeSaving ? "جاري الحفظ..." : "حفظ المسار"}
          </button>
        </div>
      </Modal>

      {/* ── مودال المكن ── */}
      <Modal open={machinesOpen} onClose={() => setMachinesOpen(false)} title="⚙️ إدارة مكن الصاج">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={newMachineName} onChange={e => setNewMachineName(e.target.value)}
              className="eg-input flex-1" placeholder="اسم المكنة الجديدة" />
            <select value={newMachineStage} onChange={e => setNewMachineStage(e.target.value as "" | Stage)} className="eg-select w-32">
              <option value="">كل المراحل</option>
              {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button onClick={addMachine} disabled={addingMachine || !newMachineName.trim()} className="eg-btn-primary">
              <Plus className="w-4 h-4" />{addingMachine ? "..." : "إضافة"}
            </button>
          </div>
          <div className="space-y-2">
            {machines.map(m => (
              <div key={m.id} className="flex items-center gap-2 bg-card2 rounded-lg px-3 py-2">
                <span className={`text-sm flex-1 ${m.active ? "text-text" : "text-subtext line-through"}`}>{m.name}</span>
                <select value={m.stage ?? ""} onChange={e => updateMachine(m, { stage: (e.target.value || null) as Stage | null })}
                  className="eg-select !py-1 !text-xs w-28">
                  <option value="">كل المراحل</option>
                  {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <button onClick={() => updateMachine(m, { active: !m.active })}
                  className={`text-xs hover:underline w-12 ${m.active ? "text-danger" : "text-success"}`}>
                  {m.active ? "تعطيل" : "تفعيل"}
                </button>
              </div>
            ))}
            {machines.length === 0 && <p className="text-xs text-subtext text-center py-3">لا توجد مكن مسجلة بعد</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════════ مكونات صغيرة ═══════════════════════ */

function StageCard({ active, onClick, title, main, mainLabel, second, secondLabel, sub, extra }: {
  active: boolean; onClick: () => void; title: string; main: number; mainLabel: string;
  second?: number; secondLabel?: string; sub?: string; extra?: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`eg-card !p-4 text-right transition-colors w-full ${active ? "!border-accent ring-1 ring-accent/40" : "hover:!border-border"}`}>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-bold ${active ? "text-accent" : "text-text"}`}>{title}</span>
        {sub && <span className="text-xs text-subtext">{sub}</span>}
      </div>
      <div className="flex items-end gap-4 mt-2">
        <div>
          <div className={`text-2xl font-bold ${main > 0 ? "text-warning" : "text-subtext"}`}>{fmt(main)}</div>
          <div className="text-[11px] text-subtext">{mainLabel}</div>
        </div>
        {second !== undefined && (
          <div className="border-r border-border pr-4">
            <div className={`text-2xl font-bold ${second > 0 ? "text-text" : "text-subtext"}`}>{fmt(second)}</div>
            <div className="text-[11px] text-subtext">{secondLabel}</div>
          </div>
        )}
      </div>
      {extra && <div className="text-[11px] mt-1">{extra}</div>}
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border transition-colors ${on
        ? "bg-accent/15 border-accent/60 text-text" : "bg-card2 border-border text-subtext hover:text-text"}`}>
      {children}{on && <X className="w-3 h-3" />}
    </button>
  );
}

function RouteChips({ route, qty, doneOf, current }: {
  route: Stage[]; qty: number; doneOf: (s: Stage) => number; current: Stage | null;
}) {
  if (route.length === 0) return <span className="text-[11px] px-2 py-0.5 rounded bg-warning/15 text-warning">بدون مسار</span>;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {route.map((s, i) => {
        const done = doneOf(s);
        const full = done >= qty;
        const style = full ? "bg-success/15 text-success" : done > 0 ? "bg-accent/15 text-accent" : "bg-card2 text-subtext";
        return (
          <Fragment key={s}>
            {i > 0 && <span className="text-subtext text-[10px]">←</span>}
            <span className={`text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap ${style} ${current === s ? "ring-1 ring-accent" : ""}`}>
              {STAGE_LABEL[s]} {fmt(done)}/{fmt(qty)}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
