"use client";
import { Fragment, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { Search, Route, AlertTriangle, Layers } from "lucide-react";

/* ═══════════════════════ أنواع وثوابت ═══════════════════════ */

type Stage = "electro" | "paint" | "anodize" | "oven";
type View = "total" | Stage;

// ترتيب ثابت: التجميع الكهربي ← (الدهان أو الأنودة) ← الفرن
const STAGES: { key: Stage; label: string }[] = [
  { key: "electro", label: "التجميع الكهربي" },
  { key: "paint",   label: "الدهان" },
  { key: "anodize", label: "الأنودة" },
  { key: "oven",    label: "الفرن" },
];
const LABEL = Object.fromEntries(STAGES.map(s => [s.key, s.label])) as Record<Stage, string>;

type WO = { wo_number: string; status: string; priority: string | null; expected_delivery: string | null };
type Item = {
  id: number; work_order_id: number; qty: number; description: string; part_no: string | null;
  sheet_steel: string | null; thickness: string | null; qty_sheet: number; qty_paint: number;
  required_painting: "YES" | "NA"; finish_route: Stage[] | null; work_order?: WO | WO[] | null;
};
type Progress = { production_item_id: number; stage: Stage; qty_done: number };
type Machine = { id: number; name: string; active: boolean; stage: Stage | null };

const PRIORITY_RANK: Record<string, number> = { "عاجلة": 0, "عالية": 1, "متوسطة": 2, "منخفضة": 3 };
const PRIORITY_STYLE: Record<string, string> = {
  "عاجلة": "bg-danger/15 text-danger",
  "عالية": "bg-warning/15 text-warning",
  "متوسطة": "bg-accent/15 text-accent",
  "منخفضة": "bg-card2 text-subtext",
};

const getWO = (it: Item): WO | undefined =>
  (Array.isArray(it.work_order) ? it.work_order[0] : it.work_order) ?? undefined;
const routeOf = (it: Item): Stage[] => it.finish_route ?? [];
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
const today = () => new Date().toISOString().slice(0, 10);

/* ═══════════════════════ الكومبوننت ═══════════════════════ */

export default function PaintMonitoringClient({
  initialItems, initialProgress, initialMachines, initialLockedIds, machineRequired,
}: {
  initialItems: Item[]; initialProgress: Progress[]; initialMachines: Machine[];
  initialLockedIds: number[]; machineRequired: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [progress, setProgress] = useState(initialProgress);
  const [machines] = useState(initialMachines);
  const [lockedIds, setLockedIds] = useState(() => new Set(initialLockedIds));

  const [view, setView] = useState<View>("total");
  const [search, setSearch] = useState("");
  const [woFilter, setWoFilter] = useState("الكل");
  const [lateOnly, setLateOnly] = useState(false);
  const [noRouteOnly, setNoRouteOnly] = useState(false);
  const [grouped, setGrouped] = useState(false);

  /* ─────────── التقدّم ─────────── */

  const doneMap = useMemo(() => {
    const m = new Map<string, number>();
    progress.forEach(p => m.set(`${p.production_item_id}:${p.stage}`, Number(p.qty_done) || 0));
    return m;
  }, [progress]);

  const doneOf = (id: number, stage: Stage) => doneMap.get(`${id}:${stage}`) ?? 0;

  // المتاح في مرحلة = اللي خلص في المرحلة اللي قبلها (أو ناتج الصاج لأول مرحلة) − اللي اتعمل هنا
  const stageInfo = (it: Item, stage: Stage) => {
    const route = routeOf(it);
    const idx = route.indexOf(stage);
    if (idx < 0) return null;
    const done = doneOf(it.id, stage);
    const input = idx === 0 ? Number(it.qty_sheet) || 0 : doneOf(it.id, route[idx - 1]);
    const available = Math.max(0, input - done);
    const pending = Math.max(0, it.qty - done);
    return { done, available, waiting: Math.max(0, pending - available), prevStage: idx > 0 ? route[idx - 1] : null };
  };

  // المخرج النهائي للبند = آخر مرحلة في المسار. البند بدون مسار لسه مابيتحسبش.
  const finishedOf = (it: Item) => {
    const r = routeOf(it);
    return r.length ? doneOf(it.id, r[r.length - 1]) : 0;
  };
  const remainingOf = (it: Item) => Math.max(0, it.qty - finishedOf(it));
  const isLate = (it: Item) => {
    const d = getWO(it)?.expected_delivery;
    return !!d && d < today();
  };

  const queue = useMemo(() => items.filter(it => remainingOf(it) > 0), [items, doneMap]);

  /* ─────────── الملخص ─────────── */

  const stats = useMemo(() => {
    const total = {
      items: queue.length,
      pieces: queue.reduce((a, it) => a + remainingOf(it), 0),
      noRoute: queue.filter(it => routeOf(it).length === 0).length,
      late: queue.filter(isLate).length,
    };
    const perStage = Object.fromEntries(STAGES.map(s => {
      let count = 0, available = 0, waiting = 0;
      queue.forEach(it => {
        const info = stageInfo(it, s.key);
        if (!info) return;
        if (info.available > 0) count++;
        available += info.available;
        waiting += info.waiting;
      });
      return [s.key, { items: count, available, waiting }];
    })) as Record<Stage, { items: number; available: number; waiting: number }>;
    return { total, perStage };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, doneMap]);

  /* ─────────── الفلاتر والترتيب ─────────── */

  const woOptions = useMemo(
    () => Array.from(new Set(queue.map(it => getWO(it)?.wo_number).filter(Boolean) as string[])).sort(), [queue]);

  const visible = useMemo(() => {
    const list = queue.filter(it => {
      if (view !== "total") {
        const info = stageInfo(it, view);
        if (!info) return false;
        if (info.available <= 0) return false;
      } else if (noRouteOnly && routeOf(it).length > 0) return false;
      const wo = getWO(it);
      if (woFilter !== "الكل" && wo?.wo_number !== woFilter) return false;
      if (lateOnly && !isLate(it)) return false;
      if (search) {
        const hay = `${it.description} ${it.part_no ?? ""} ${wo?.wo_number ?? ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    });
    return list.sort((a, b) => {
      const wa = getWO(a), wb = getWO(b);
      const pa = PRIORITY_RANK[wa?.priority ?? "متوسطة"] ?? 2, pb = PRIORITY_RANK[wb?.priority ?? "متوسطة"] ?? 2;
      if (pa !== pb) return pa - pb;
      const da = wa?.expected_delivery ?? "9999", db = wb?.expected_delivery ?? "9999";
      if (da !== db) return da < db ? -1 : 1;
      const na = wa?.wo_number ?? "", nb = wb?.wo_number ?? "";
      if (na !== nb) return na.localeCompare(nb);
      return a.id - b.id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, doneMap, view, noRouteOnly, woFilter, lateOnly, search]);

  const groups = useMemo(() => {
    if (!grouped) return [{ key: "", label: "", items: visible }];
    const map = new Map<string, Item[]>();
    visible.forEach(it => {
      const k = `${it.sheet_steel ?? "—"} · ${it.thickness ?? "—"}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    });
    return Array.from(map.entries()).map(([k, list]) => ({ key: k, label: k, items: list }));
  }, [visible, grouped]);

  const piecesFor = (it: Item) =>
    view === "total" ? remainingOf(it) : stageInfo(it, view)?.available ?? 0;

  /* ─────────── تسجيل ─────────── */

  const [logItem, setLogItem] = useState<{ item: Item; stage: Stage } | null>(null);
  const [logQty, setLogQty] = useState("");
  const [logMachineId, setLogMachineId] = useState("");
  const [logNote, setLogNote] = useState("");
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState("");

  const logAvailable = logItem ? stageInfo(logItem.item, logItem.stage)?.available ?? 0 : 0;
  const machinesForLog = machines.filter(m => !m.stage || (logItem && m.stage === logItem.stage));

  const openLog = (item: Item, stage: Stage) => {
    setLogItem({ item, stage }); setLogQty(""); setLogNote(""); setLogError("");
    const ms = machines.filter(m => !m.stage || m.stage === stage);
    setLogMachineId(ms.length === 1 ? String(ms[0].id) : "");
  };

  const submitLog = async () => {
    if (!logItem) return;
    const q = parseFloat(logQty);
    if (!q || q <= 0) { setLogError("أدخل كمية صحيحة"); return; }
    if (q > logAvailable) { setLogError(`الكمية أكبر من المتاح (${fmt(logAvailable)})`); return; }
    if (machineRequired && !logMachineId) { setLogError("اختيار المكنة إجباري"); return; }
    setLogging(true); setLogError("");

    const { data, error } = await supabase.rpc("log_finish_stage", {
      p_item_id: logItem.item.id,
      p_stage: logItem.stage,
      p_qty: q,
      p_machine_id: logMachineId ? parseInt(logMachineId) : null,
      p_note: logNote.trim() || null,
    });
    setLogging(false);
    if (error) { setLogError(error.message); return; }

    const res = data as { qty_done: number };
    const itemId = logItem.item.id;
    const stage = logItem.stage;
    setProgress(prev => {
      const idx = prev.findIndex(p => p.production_item_id === itemId && p.stage === stage);
      if (idx >= 0) {
        const next = [...prev]; next[idx] = { ...next[idx], qty_done: Number(res.qty_done) }; return next;
      }
      return [...prev, { production_item_id: itemId, stage, qty_done: Number(res.qty_done) }];
    });
    // لو الدهان كان آخر مرحلة، إجمالي الدهان اتزاد في الداتابيز
    setItems(prev => prev.map(it => it.id === itemId && stage === "paint" && routeOf(it).at(-1) === "paint"
      ? { ...it, qty_paint: (it.qty_paint ?? 0) + q } : it));
    setLockedIds(prev => new Set(prev).add(itemId));
    setLogItem(null);
  };

  /* ─────────── المسار ─────────── */

  const [routeTargets, setRouteTargets] = useState<number[] | null>(null);
  const [routeDraft, setRouteDraft] = useState<Set<Stage>>(new Set());
  const [routeSaving, setRouteSaving] = useState(false);
  const [routeMsg, setRouteMsg] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const openRoute = (ids: number[]) => {
    const first = items.find(it => it.id === ids[0]);
    setRouteDraft(new Set(ids.length === 1 && first ? routeOf(first) : []));
    setRouteTargets(ids); setRouteMsg("");
  };

  // الدهان والأنودة بدائل: اختيار أحدهم يشيل التاني
  const toggleRouteStage = (s: Stage) => setRouteDraft(prev => {
    const n = new Set(prev);
    if (n.has(s)) { n.delete(s); return n; }
    n.add(s);
    if (s === "paint") n.delete("anodize");
    if (s === "anodize") n.delete("paint");
    return n;
  });

  const saveRoute = async () => {
    if (!routeTargets) return;
    setRouteSaving(true); setRouteMsg("");
    const route = STAGES.map(s => s.key).filter(k => routeDraft.has(k));
    const { data, error } = await supabase.rpc("set_finish_route", { p_item_ids: routeTargets, p_route: route });
    setRouteSaving(false);
    if (error) { setRouteMsg(error.message); return; }
    const res = data as { route: Stage[]; updated: number[]; skipped: { id: number; description: string }[] };
    const updated = new Set(res.updated);
    setItems(prev => prev.map(it => updated.has(it.id) ? { ...it, finish_route: res.route } : it));
    setSelected(new Set());
    if (res.skipped.length) {
      setRouteMsg(`اتحدد المسار لـ ${res.updated.length} بند. ${res.skipped.length} بند اتسابوا لأنهم بدأ التسجيل عليهم: ${res.skipped.map(s => s.description).join("، ")}`);
    } else {
      setRouteTargets(null);
    }
  };

  const toggleSelect = (id: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisibleSelected = visible.length > 0 && visible.every(it => selected.has(it.id));
  const toggleSelectAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map(it => it.id)));

  /* ═══════════════════════ العرض ═══════════════════════ */

  const colCount = view === "total" ? 10 : 9;

  return (
    <div className="p-4 md:p-6 w-full mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-text">🎨 متابعة قسم الدهان</h1>
        <p className="text-sm text-subtext mt-0.5">
          التجميع الكهربي ← (الدهان أو الأنودة) ← الفرن — كل مرحلة بتشتغل على اللي خلص من اللي قبلها
        </p>
      </div>

      {/* كروت */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <button onClick={() => setView("total")}
          className={`eg-card !p-4 text-right w-full ${view === "total" ? "!border-accent ring-1 ring-accent/40" : "hover:!border-border"}`}>
          <div className="text-sm font-bold text-text">الإجمالي</div>
          <div className="flex items-end gap-4 mt-2">
            <div>
              <div className={`text-2xl font-bold ${stats.total.pieces > 0 ? "text-warning" : "text-subtext"}`}>{fmt(stats.total.pieces)}</div>
              <div className="text-[11px] text-subtext">قطعة متبقية</div>
            </div>
            <div className="border-r border-border pr-4">
              <div className={`text-2xl font-bold ${stats.total.items > 0 ? "text-text" : "text-subtext"}`}>{fmt(stats.total.items)}</div>
              <div className="text-[11px] text-subtext">بند متبقي</div>
            </div>
          </div>
          {stats.total.noRoute > 0 && <div className="text-[11px] mt-1 text-warning">{stats.total.noRoute} بدون مسار</div>}
        </button>
        {STAGES.map(s => {
          const st = stats.perStage[s.key];
          const active = view === s.key;
          return (
            <button key={s.key} onClick={() => setView(s.key)}
              className={`eg-card !p-4 text-right w-full ${active ? "!border-accent ring-1 ring-accent/40" : "hover:!border-border"}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${active ? "text-accent" : "text-text"}`}>{s.label}</span>
                <span className="text-xs text-subtext">{st.items} بند</span>
              </div>
              <div className={`text-2xl font-bold mt-2 ${st.available > 0 ? "text-warning" : "text-subtext"}`}>{fmt(st.available)}</div>
              <div className="text-[11px] text-subtext">قطعة جاهزة للشغل</div>
              {st.waiting > 0 && <div className="text-[11px] mt-1 text-subtext">{fmt(st.waiting)} منتظرة مرحلة سابقة</div>}
            </button>
          );
        })}
      </div>

      {/* فلاتر */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="eg-input pr-9 w-56" placeholder="بحث بالوصف أو رقم القطعة أو الأمر" />
        </div>
        <select value={woFilter} onChange={e => setWoFilter(e.target.value)} className="eg-select w-40">
          <option value="الكل">كل الأوامر</option>
          {woOptions.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <Chip on={lateOnly} onClick={() => setLateOnly(v => !v)}>
          <AlertTriangle className="w-3.5 h-3.5" />المتأخر فقط
        </Chip>
        <Chip on={grouped} onClick={() => setGrouped(v => !v)}>
          <Layers className="w-3.5 h-3.5" />تجميع بالخامة والسُمك
        </Chip>
        {view === "total" && (
          <Chip on={noRouteOnly} onClick={() => setNoRouteOnly(v => !v)}>بدون مسار فقط</Chip>
        )}
      </div>

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
        <table className="eg-table w-full min-w-[900px]">
          <thead><tr>
            <th className="w-10">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} aria-label="تحديد الكل" />
            </th>
            <th className="w-36">أمر الشغل</th>
            <th>الوصف</th>
            <th className="w-24">الخامة</th>
            <th className="w-20">السُمك</th>
            <th className="w-20">المطلوب</th>
            {view === "total"
              ? <><th className="w-20">خلص</th><th className="w-20">المتبقي</th></>
              : <th className="w-24">المتاح هنا</th>}
            <th className="w-64">المسار</th>
            <th className="w-40">إجراء</th>
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
                  return (
                    <tr key={it.id}>
                      <td>
                        <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggleSelect(it.id)} disabled={lockedIds.has(it.id)} />
                      </td>
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
                      <td className="text-text whitespace-normal break-words">
                        {it.description}
                        {it.part_no && <div className="font-mono text-[10px] text-subtext">{it.part_no}</div>}
                      </td>
                      <td>{it.sheet_steel ?? "—"}</td>
                      <td>{it.thickness ?? "—"}</td>
                      <td>{fmt(it.qty)}</td>
                      {view === "total"
                        ? <><td className="text-text font-medium">{fmt(finishedOf(it))}</td>
                            <td className="text-warning font-bold">{fmt(remainingOf(it))}</td></>
                        : <td>
                            <span className="font-bold text-warning">{fmt(info!.available)}</span>
                            {info!.waiting > 0 && info!.prevStage && (
                              <div className="text-[10px] text-subtext">+{fmt(info!.waiting)} في {LABEL[info!.prevStage]}</div>
                            )}
                          </td>}
                      <td><RouteChips route={route} qty={it.qty} doneOf={s => doneOf(it.id, s)} current={view !== "total" ? view : null} /></td>
                      <td>
                        <div className="flex items-center gap-2">
                          {view !== "total" ? (
                            <button onClick={() => openLog(it, view)} disabled={info!.available <= 0}
                              className="eg-btn-primary text-xs !py-1.5 disabled:opacity-40">
                              تسجيل {LABEL[view]}
                            </button>
                          ) : route.length === 0 ? (
                            <span className="text-[11px] text-subtext">حدد المسار أولاً</span>
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
          <EmptyState message={view === "total" ? "لا توجد بنود متبقية مطابقة للفلتر" : `مفيش شغل جاهز في ${LABEL[view as Stage]} دلوقتي`} />
        )}
      </div>

      {/* مودال التسجيل */}
      <Modal open={!!logItem} onClose={() => setLogItem(null)}
        title={logItem ? `📝 تسجيل ${LABEL[logItem.stage]}` : ""}>
        {logItem && (
          <div className="space-y-4">
            <div className="bg-card2 rounded-lg p-3 text-sm space-y-2">
              <p className="text-text font-medium">{logItem.item.description}</p>
              <p className="text-subtext text-xs">
                أمر الشغل: {getWO(logItem.item)?.wo_number ?? "—"} — المطلوب: {fmt(logItem.item.qty)} — المتاح للتسجيل: <b className="text-warning">{fmt(logAvailable)}</b>
              </p>
              <RouteChips route={routeOf(logItem.item)} qty={logItem.item.qty}
                doneOf={s => doneOf(logItem.item.id, s)} current={logItem.stage} />
            </div>
            <div>
              <label className="eg-label">الكمية</label>
              <div className="flex gap-2">
                <input type="number" min="0.01" step="any" value={logQty} onChange={e => setLogQty(e.target.value)}
                  className="eg-input flex-1" autoFocus onKeyDown={e => e.key === "Enter" && submitLog()} />
                <button onClick={() => setLogQty(String(logAvailable))} className="eg-btn-ghost text-sm">الكل ({fmt(logAvailable)})</button>
              </div>
            </div>
            <div>
              <label className="eg-label">المكنة {machineRequired ? "*" : "(اختياري)"}</label>
              <select value={logMachineId} onChange={e => setLogMachineId(e.target.value)} className="eg-select">
                <option value="">— بدون تحديد —</option>
                {machinesForLog.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
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

      {/* مودال المسار */}
      <Modal open={!!routeTargets} onClose={() => setRouteTargets(null)}
        title={routeTargets && routeTargets.length > 1 ? `🧭 مسار ${routeTargets.length} بند` : "🧭 مسار البند"}>
        <div className="space-y-4">
          <p className="text-xs text-subtext">
            الترتيب ثابت: التجميع الكهربي ← (الدهان أو الأنودة) ← الفرن. الدهان والأنودة بدائل، اختار واحد بس.
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            {STAGES.map((s, i) => (
              <Fragment key={s.key}>
                {i > 0 && <span className="text-subtext text-xs">←</span>}
                <button onClick={() => toggleRouteStage(s.key)}
                  className={`px-3 py-2 rounded-lg text-sm border transition-colors ${routeDraft.has(s.key)
                    ? "bg-accent/20 border-accent text-text" : "bg-card2 border-border text-subtext hover:text-text"}`}>
                  {s.label}
                </button>
              </Fragment>
            ))}
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => setRouteDraft(new Set(["electro", "oven"] as Stage[]))} className="text-accent hover:underline">نحاس: كهربي ← فرن</button>
            <button onClick={() => setRouteDraft(new Set(["paint"] as Stage[]))} className="text-accent hover:underline">دهان بس</button>
            <button onClick={() => setRouteDraft(new Set(["anodize"] as Stage[]))} className="text-accent hover:underline">أنودة بس</button>
            <button onClick={() => setRouteDraft(new Set())} className="text-subtext hover:underline">مسح</button>
          </div>
          <p className="text-[11px] text-subtext">بعد أول تسجيل على أي مرحلة، المسار بيتقفل.</p>
          {routeMsg && <p className="text-sm text-warning">{routeMsg}</p>}
          <button onClick={saveRoute} disabled={routeSaving || routeDraft.size === 0} className="eg-btn-primary w-full justify-center">
            {routeSaving ? "جاري الحفظ..." : "حفظ المسار"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════════ مكونات صغيرة ═══════════════════════ */

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border transition-colors ${on
        ? "bg-accent/15 border-accent/60 text-text" : "bg-card2 border-border text-subtext hover:text-text"}`}>
      {children}
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
        const style = done >= qty ? "bg-success/15 text-success" : done > 0 ? "bg-accent/15 text-accent" : "bg-card2 text-subtext";
        return (
          <Fragment key={s}>
            {i > 0 && <span className="text-subtext text-[10px]">←</span>}
            <span className={`text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap ${style} ${current === s ? "ring-1 ring-accent" : ""}`}>
              {LABEL[s]} {fmt(done)}/{fmt(qty)}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
