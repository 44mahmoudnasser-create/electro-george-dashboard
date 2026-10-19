"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { Search, Settings, Plus, Paintbrush, Layers, AlertTriangle, Radio, RefreshCw, X } from "lucide-react";

/* ═══════════════════════ أنواع وثوابت ═══════════════════════ */

type WO = { wo_number: string; status: string; priority: string | null; expected_delivery: string | null };
type Item = {
  id: number;
  work_order_id: number;
  qty: number;
  description: string;
  part_no: string | null;
  sheet_steel: string | null;
  thickness: string | null;
  qty_sheet: number;
  qty_paint: number;
  paint_type_id: number | null;
  work_order?: WO | WO[] | null;
};
type PaintType = { id: number; name: string; active: boolean };

const PRIORITY_RANK: Record<string, number> = { "عاجلة": 0, "عالية": 1, "متوسطة": 2, "منخفضة": 3 };
const PRIORITY_STYLE: Record<string, string> = {
  "عاجلة": "bg-danger/15 text-danger",
  "عالية": "bg-warning/15 text-warning",
  "متوسطة": "bg-accent/15 text-accent",
  "منخفضة": "bg-card2 text-subtext",
};

const getWO = (it: Item): WO | undefined =>
  (Array.isArray(it.work_order) ? it.work_order[0] : it.work_order) ?? undefined;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
const today = () => new Date().toISOString().slice(0, 10);
const avail = (it: Item) => Math.max(0, (it.qty_sheet ?? 0) - (it.qty_paint ?? 0));
const remaining = (it: Item) => Math.max(0, (it.qty ?? 0) - (it.qty_paint ?? 0));
const waitingSheet = (it: Item) => Math.max(0, (it.qty ?? 0) - (it.qty_sheet ?? 0));
const isLate = (it: Item) => {
  const d = getWO(it)?.expected_delivery;
  return !!d && d < today();
};

/* ═══════════════════════ الكومبوننت ═══════════════════════ */

export default function PaintMonitoringClient({
  initialItems, initialPaintTypes,
}: { initialItems: Item[]; initialPaintTypes: PaintType[] }) {
  const [items, setItems] = useState(initialItems);
  const [paintTypes, setPaintTypes] = useState(initialPaintTypes);
  const [live, setLive] = useState(false);
  const [newItemsPending, setNewItemsPending] = useState(false);

  const [search, setSearch] = useState("");
  const [woFilter, setWoFilter] = useState("الكل");
  const [typeFilter, setTypeFilter] = useState<string>("الكل");   // id أو "none" أو "الكل"
  const [lateOnly, setLateOnly] = useState(false);
  const [showWaiting, setShowWaiting] = useState(false);
  const [groupOverride, setGroupOverride] = useState<boolean | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const grouped = groupOverride ?? true;

  const typeName = (id: number | null) => {
    if (id == null) return "بدون نوع";
    return paintTypes.find(t => t.id === id)?.name ?? "نوع محذوف";
  };

  /* ─────────── الكروت ─────────── */
  const stats = useMemo(() => ({
    remaining: items.reduce((a, it) => a + remaining(it), 0),
    ready: items.reduce((a, it) => a + avail(it), 0),
    waiting: items.reduce((a, it) => a + waitingSheet(it), 0),
    items: items.length,
    noType: items.filter(it => it.paint_type_id == null).length,
    late: items.filter(isLate).length,
  }), [items]);

  /* ─────────── الفلاتر والترتيب ─────────── */
  const woOptions = useMemo(
    () => Array.from(new Set(items.map(it => getWO(it)?.wo_number).filter(Boolean) as string[])).sort(), [items]);

  const visible = useMemo(() => {
    const list = items.filter(it => {
      if (!showWaiting && avail(it) <= 0) return false;
      if (woFilter !== "الكل" && getWO(it)?.wo_number !== woFilter) return false;
      if (typeFilter === "none" && it.paint_type_id != null) return false;
      if (typeFilter !== "الكل" && typeFilter !== "none" && String(it.paint_type_id) !== typeFilter) return false;
      if (lateOnly && !isLate(it)) return false;
      if (search) {
        const hay = `${it.description} ${it.part_no ?? ""} ${getWO(it)?.wo_number ?? ""}`.toLowerCase();
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
  }, [items, showWaiting, woFilter, typeFilter, lateOnly, search]);

  // تجميع حسب نوع الدهان
  const groups = useMemo(() => {
    if (!grouped) return [{ key: "all", label: "", items: visible }];
    const map = new Map<string, Item[]>();
    visible.forEach(it => {
      const k = it.paint_type_id == null ? "none" : String(it.paint_type_id);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(it);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => (a === "none" ? 1 : b === "none" ? -1 : 0))
      .map(([k, list]) => ({ key: k, label: k === "none" ? "بدون نوع دهان" : typeName(Number(k)), items: list }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, grouped, paintTypes]);

  /* ─────────── التحديد ─────────── */
  const toggleSelect = (id: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisibleSelected = visible.length > 0 && visible.every(it => selected.has(it.id));
  const toggleSelectAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map(it => it.id)));

  /* ─────────── تسجيل الدهان ─────────── */
  const [logItem, setLogItem] = useState<Item | null>(null);
  const [logQty, setLogQty] = useState("");
  const [logNote, setLogNote] = useState("");
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState("");

  const openLog = (it: Item) => {
    setLogItem(it); setLogQty(""); setLogNote(""); setLogError("");
  };

  const submitLog = async () => {
    if (!logItem) return;
    const q = parseFloat(logQty);
    if (!q || q <= 0) { setLogError("أدخل كمية صحيحة"); return; }
    if (q > avail(logItem)) { setLogError(`الكمية أكبر من المتاح للدهان (${fmt(avail(logItem))})`); return; }
    setLogging(true); setLogError("");
    const { data, error } = await supabase.rpc("log_paint", {
      p_item_id: logItem.id, p_qty: q, p_note: logNote.trim() || null,
    });
    setLogging(false);
    if (error) { setLogError(error.message); return; }
    const res = data as { qty_paint: number };
    setItems(prev => prev.map(it => it.id === logItem.id ? { ...it, qty_paint: Number(res.qty_paint) } : it));
    setLogItem(null);
  };

  /* ─────────── تحديد نوع الدهان ─────────── */
  const [typeTargets, setTypeTargets] = useState<number[] | null>(null);
  const [typeDraft, setTypeDraft] = useState<string>("");
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeMsg, setTypeMsg] = useState("");

  const openType = (ids: number[]) => {
    const first = items.find(it => it.id === ids[0]);
    setTypeDraft(ids.length === 1 && first?.paint_type_id != null ? String(first.paint_type_id) : "");
    setTypeTargets(ids); setTypeMsg("");
  };

  const saveType = async () => {
    if (!typeTargets) return;
    setTypeSaving(true); setTypeMsg("");
    const newId = typeDraft ? parseInt(typeDraft) : null;
    const { data, error } = await supabase.rpc("set_paint_type", {
      p_item_ids: typeTargets,
      p_paint_type_id: newId,
    });
    setTypeSaving(false);
    if (error) { setTypeMsg(error.message); return; }
    const res = data as { updated: number[]; skipped: { id: number; description: string }[] };
    const updated = new Set(res.updated);
    setItems(prev => prev.map(it => updated.has(it.id) ? { ...it, paint_type_id: newId } : it));
    setSelected(new Set());
    if (res.skipped.length) {
      setTypeMsg(`اتغير النوع لـ ${res.updated.length} بند. ${res.skipped.length} بند اتسابوا لأن الدهان بدأ عليهم: ${res.skipped.map(s => s.description).join("، ")}`);
    } else {
      setTypeTargets(null);
    }
  };

  /* ─────────── إدارة أنواع الدهان ─────────── */
  const [typesOpen, setTypesOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [addingType, setAddingType] = useState(false);

  const addType = async () => {
    const name = newTypeName.trim();
    if (!name) return;
    setAddingType(true);
    const { data, error } = await supabase.from("paint_types")
      .insert({ name }).select("id, name, active").single();
    setAddingType(false);
    if (error) { alert(error.message.includes("unique") ? "النوع ده موجود قبل كده" : error.message); return; }
    setPaintTypes(prev => [...prev, data as PaintType].sort((a, b) => a.name.localeCompare(b.name)));
    setNewTypeName("");
  };

  const toggleType = async (t: PaintType) => {
    const { error } = await supabase.from("paint_types").update({ active: !t.active }).eq("id", t.id);
    if (error) { alert(error.message); return; }
    setPaintTypes(prev => prev.map(x => x.id === t.id ? { ...x, active: !t.active } : x));
  };

  /* ─────────── التحديث اللحظي ─────────── */
  useEffect(() => {
    const channel = supabase
      .channel("paint-monitoring")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "wo_production_items" }, payload => {
        const n = payload.new as Partial<Item> & { id: number };
        setItems(prev => prev.map(it => it.id === n.id ? {
          ...it,
          qty_sheet: n.qty_sheet ?? it.qty_sheet,
          qty_paint: n.qty_paint ?? it.qty_paint,
          paint_type_id: n.paint_type_id !== undefined ? n.paint_type_id : it.paint_type_id,
          qty: n.qty ?? it.qty,
        } : it));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wo_production_items" }, () => {
        setNewItemsPending(true);
      })
      .subscribe(status => setLive(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(channel); };
  }, []);

  /* ═══════════════════════ العرض ═══════════════════════ */

  return (
    <div className="p-4 md:p-6 w-full mx-auto space-y-4">
      {/* الهيدر */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text flex items-center gap-2">
            🎨 متابعة قسم الدهان
            <span title={live ? "متصل — التحديث لحظي" : "غير متصل"}
              className={`inline-flex items-center gap-1 text-[11px] font-normal px-2 py-0.5 rounded-full ${live ? "bg-success/15 text-success" : "bg-card2 text-subtext"}`}>
              <Radio className="w-3 h-3" />{live ? "مباشر" : "غير متصل"}
            </span>
          </h1>
          <p className="text-sm text-subtext mt-0.5">الأجزاء اللي اتستلمت من الصاج ومحتاجة دهان، مرتبة حسب نوع الدهان</p>
        </div>
        <button onClick={() => setTypesOpen(true)} className="eg-btn-ghost text-sm">
          <Settings className="w-4 h-4" />أنواع الدهان
        </button>
      </div>

      {newItemsPending && (
        <div className="eg-card !py-3 flex items-center justify-between border-accent/40">
          <span className="text-sm text-text">فيه بنود جديدة اتضافت</span>
          <button onClick={() => window.location.reload()} className="eg-btn-primary text-xs !py-1.5">
            <RefreshCw className="w-3.5 h-3.5" />تحديث
          </button>
        </div>
      )}

      {/* الكروت */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card title="جاهز للدهان الآن" main={stats.ready} mainLabel="قطعة مستلمة من الصاج"
          sub={`${stats.items} بند`} accent />
        <Card title="إجمالي المتبقي" main={stats.remaining} mainLabel="قطعة لسه ماتدهنتش"
          second={stats.noType} secondLabel="بند بدون نوع دهان" />
        <Card title="بانتظار الصاج" main={stats.waiting} mainLabel="قطعة لسه ماتستلمتش"
          second={stats.late} secondLabel="أمر متأخر" secondWarn />
        <Card title="أنواع الدهان" main={paintTypes.filter(t => t.active).length} mainLabel="نوع نشط"
          sub={`${paintTypes.length} إجمالي`} />
      </div>

      {/* الفلاتر */}
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
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="eg-select w-44">
          <option value="الكل">كل أنواع الدهان</option>
          <option value="none">بدون نوع</option>
          {paintTypes.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <Chip on={lateOnly} onClick={() => setLateOnly(v => !v)}>
          <AlertTriangle className="w-3.5 h-3.5" />المتأخر فقط{stats.late ? ` (${stats.late})` : ""}
        </Chip>
        <Chip on={grouped} onClick={() => setGroupOverride(!grouped)}>
          <Layers className="w-3.5 h-3.5" />تجميع بنوع الدهان
        </Chip>
        <Chip on={showWaiting} onClick={() => setShowWaiting(v => !v)}>عرض المنتظر من الصاج</Chip>
      </div>

      {/* شريط التحديد */}
      {selected.size > 0 && (
        <div className="eg-card !py-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-text">تم تحديد {selected.size} بند</span>
          <div className="flex gap-2">
            <button onClick={() => openType(Array.from(selected))} className="eg-btn-primary text-sm !py-1.5">
              <Paintbrush className="w-4 h-4" />تحديد نوع الدهان
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
            <th className="w-28">الخامة / السُمك</th>
            <th className="w-40">نوع الدهان</th>
            <th className="w-20">المطلوب</th>
            <th className="w-20">من الصاج</th>
            <th className="w-20">اتدهن</th>
            <th className="w-24">المتاح</th>
            <th className="w-28">إجراء</th>
          </tr></thead>
          <tbody>
            {groups.map(g => (
              <Fragment key={g.key}>
                {grouped && (
                  <tr className="bg-card2/60">
                    <td colSpan={11} className="!py-2 text-xs">
                      <span className="font-bold text-text">{g.label}</span>
                      <span className="text-subtext mr-3">
                        {g.items.length} بند — {fmt(g.items.reduce((a, it) => a + avail(it), 0))} قطعة جاهزة
                      </span>
                    </td>
                  </tr>
                )}
                {g.items.map(it => {
                  const wo = getWO(it);
                  const late = isLate(it);
                  const a = avail(it);
                  return (
                    <tr key={it.id} className={a <= 0 ? "opacity-50" : ""}>
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
                      <td className="text-xs">{it.sheet_steel ?? "—"} / {it.thickness ?? "—"}</td>
                      <td>
                        {it.paint_type_id != null
                          ? <span className="text-xs px-2 py-1 rounded bg-accent/15 text-accent">{typeName(it.paint_type_id)}</span>
                          : <span className="text-xs px-2 py-1 rounded bg-warning/15 text-warning">بدون نوع</span>}
                      </td>
                      <td>{fmt(it.qty)}</td>
                      <td className="text-text">{fmt(it.qty_sheet ?? 0)}</td>
                      <td className="text-success font-medium">{fmt(it.qty_paint ?? 0)}</td>
                      <td>
                        <span className={`font-bold ${a > 0 ? "text-warning" : "text-subtext"}`}>{fmt(a)}</span>
                        {waitingSheet(it) > 0 && (
                          <div className="text-[10px] text-subtext">+{fmt(waitingSheet(it))} منتظرة الصاج</div>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openLog(it)} disabled={a <= 0}
                            className="eg-btn-primary text-xs !py-1.5 disabled:opacity-40">
                            تسجيل دهان
                          </button>
                          {(it.qty_paint ?? 0) === 0 && (
                            <button onClick={() => openType([it.id])} className="text-subtext hover:text-accent" title="تغيير نوع الدهان">
                              <Paintbrush className="w-4 h-4" />
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
          <EmptyState message={paintTypes.length === 0
            ? "ابدأ بإضافة أنواع الدهان من زرار 'أنواع الدهان'"
            : "مفيش أجزاء جاهزة للدهان دلوقتي"} />
        )}
      </div>

      {/* ── مودال تسجيل الدهان ── */}
      <Modal open={!!logItem} onClose={() => setLogItem(null)} title="🎨 تسجيل دهان">
        {logItem && (
          <div className="space-y-4">
            <div className="bg-card2 rounded-lg p-3 text-sm space-y-1">
              <p className="text-text font-medium">{logItem.description}</p>
              <p className="text-xs text-subtext">
                أمر الشغل: {getWO(logItem)?.wo_number ?? "—"} · نوع الدهان: <b className="text-accent">{typeName(logItem.paint_type_id)}</b>
              </p>
              <p className="text-xs text-subtext">
                المستلم من الصاج: {fmt(logItem.qty_sheet)} · اتدهن: {fmt(logItem.qty_paint)} · المتاح: <b className="text-warning">{fmt(avail(logItem))}</b>
              </p>
            </div>
            <div>
              <label className="eg-label">الكمية</label>
              <div className="flex gap-2">
                <input type="number" min="0.01" step="any" value={logQty} autoFocus
                  onChange={e => setLogQty(e.target.value)} className="eg-input flex-1"
                  onKeyDown={e => e.key === "Enter" && submitLog()} />
                <button onClick={() => setLogQty(String(avail(logItem)))} className="eg-btn-ghost text-sm">الكل ({fmt(avail(logItem))})</button>
              </div>
            </div>
            <div>
              <label className="eg-label">ملاحظة (اختياري)</label>
              <input value={logNote} onChange={e => setLogNote(e.target.value)} className="eg-input" />
            </div>
            {logError && <p className="text-sm text-danger">{logError}</p>}
            <button onClick={submitLog} disabled={logging} className="eg-btn-success w-full justify-center">
              {logging ? "جاري التسجيل..." : "✅ تأكيد"}
            </button>
          </div>
        )}
      </Modal>

      {/* ── مودال نوع الدهان ── */}
      <Modal open={!!typeTargets} onClose={() => setTypeTargets(null)}
        title={typeTargets && typeTargets.length > 1 ? `🎨 نوع دهان ${typeTargets.length} بند` : "🎨 نوع الدهان"}>
        <div className="space-y-4">
          <div>
            <label className="eg-label">نوع الدهان</label>
            <select value={typeDraft} onChange={e => setTypeDraft(e.target.value)} className="eg-select">
              <option value="">— بدون نوع —</option>
              {paintTypes.filter(t => t.active || String(t.id) === typeDraft).map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.active ? "" : " (متعطل)"}</option>
              ))}
            </select>
            {paintTypes.filter(t => t.active).length === 0 && (
              <p className="text-xs text-subtext mt-1">لازم تضيف نوع دهان الأول من "أنواع الدهان"</p>
            )}
          </div>
          <p className="text-[11px] text-subtext">مايتغيرش النوع بعد ما الدهان يبدأ على البند.</p>
          {typeMsg && <p className="text-sm text-warning">{typeMsg}</p>}
          <button onClick={saveType} disabled={typeSaving} className="eg-btn-primary w-full justify-center">
            {typeSaving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </Modal>

      {/* ── مودال أنواع الدهان ── */}
      <Modal open={typesOpen} onClose={() => setTypesOpen(false)} title="⚙️ أنواع الدهان">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
              className="eg-input flex-1" placeholder="اسم نوع الدهان (مثال: RAL 9010 مات)"
              onKeyDown={e => e.key === "Enter" && addType()} />
            <button onClick={addType} disabled={addingType || !newTypeName.trim()} className="eg-btn-primary">
              <Plus className="w-4 h-4" />{addingType ? "..." : "إضافة"}
            </button>
          </div>
          <div className="space-y-2">
            {paintTypes.map(t => (
              <div key={t.id} className="flex items-center gap-2 bg-card2 rounded-lg px-3 py-2">
                <span className={`text-sm flex-1 ${t.active ? "text-text" : "text-subtext line-through"}`}>{t.name}</span>
                <button onClick={() => toggleType(t)}
                  className={`text-xs hover:underline ${t.active ? "text-danger" : "text-success"}`}>
                  {t.active ? "تعطيل" : "تفعيل"}
                </button>
              </div>
            ))}
            {paintTypes.length === 0 && <p className="text-xs text-subtext text-center py-3">لا توجد أنواع دهان بعد</p>}
          </div>
          <p className="text-[11px] text-subtext">التعطيل بيخفي النوع من الاختيار بس، والبنود القديمة اللي عليه بتفضل زي ما هي.</p>
        </div>
      </Modal>
    </div>
  );
}

/* ═══════════════════════ مكونات صغيرة ═══════════════════════ */

function Card({ title, main, mainLabel, second, secondLabel, secondWarn, sub, accent }: {
  title: string; main: number; mainLabel: string; second?: number; secondLabel?: string;
  secondWarn?: boolean; sub?: string; accent?: boolean;
}) {
  return (
    <div className={`eg-card !p-4 ${accent ? "!border-accent/60" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-text">{title}</span>
        {sub && <span className="text-xs text-subtext">{sub}</span>}
      </div>
      <div className="flex items-end gap-4 mt-2">
        <div>
          <div className={`text-2xl font-bold ${main > 0 ? (accent ? "text-warning" : "text-text") : "text-subtext"}`}>{fmt(main)}</div>
          <div className="text-[11px] text-subtext">{mainLabel}</div>
        </div>
        {second !== undefined && (
          <div className="border-r border-border pr-4">
            <div className={`text-2xl font-bold ${secondWarn && second > 0 ? "text-danger" : second > 0 ? "text-text" : "text-subtext"}`}>{fmt(second)}</div>
            <div className="text-[11px] text-subtext">{secondLabel}</div>
          </div>
        )}
      </div>
    </div>
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
