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
  Paintbrush, Settings, Plus, Layers, AlertTriangle, RefreshCw, Info, Check, Hourglass, Lock, Palette,
} from "lucide-react";

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
  const toast = useToast();
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

  const filtersActive = !!search || woFilter !== "الكل" || typeFilter !== "الكل" || lateOnly;
  const clearFilters = () => { setSearch(""); setWoFilter("الكل"); setTypeFilter("الكل"); setLateOnly(false); };

  /* ─────────── التحديد ─────────── */
  const toggleSelect = (id: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisibleSelected = visible.length > 0 && visible.every(it => selected.has(it.id));
  const someVisibleSelected = visible.some(it => selected.has(it.id));
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

  const submitLog = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!logItem || logging) return;
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
    toast.success(`تم تسجيل ${fmt(q)} قطعة دهان`);
  };

  /* ─────────── تحديد نوع الدهان ─────────── */
  const [typeTargets, setTypeTargets] = useState<number[] | null>(null);
  const [typeDraft, setTypeDraft] = useState<string>("");
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeMsg, setTypeMsg] = useState("");      // بنود اتسابت (الدهان بدأ عليها)
  const [typeError, setTypeError] = useState("");

  const openType = (ids: number[]) => {
    const first = items.find(it => it.id === ids[0]);
    setTypeDraft(ids.length === 1 && first?.paint_type_id != null ? String(first.paint_type_id) : "");
    setTypeTargets(ids); setTypeMsg(""); setTypeError("");
  };

  const saveType = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!typeTargets || typeSaving) return;
    setTypeSaving(true); setTypeMsg(""); setTypeError("");
    const newId = typeDraft ? parseInt(typeDraft) : null;
    const { data, error } = await supabase.rpc("set_paint_type", {
      p_item_ids: typeTargets,
      p_paint_type_id: newId,
    });
    setTypeSaving(false);
    if (error) { setTypeError(error.message); return; }
    const res = data as { updated: number[]; skipped: { id: number; description: string }[] };
    const updated = new Set(res.updated);
    setItems(prev => prev.map(it => updated.has(it.id) ? { ...it, paint_type_id: newId } : it));
    setSelected(new Set());
    if (res.skipped.length) {
      setTypeMsg(`اتغير النوع لـ ${res.updated.length} بند. ${res.skipped.length} بند اتسابوا لأن الدهان بدأ عليهم: ${res.skipped.map(s => s.description).join("، ")}`);
    } else {
      setTypeTargets(null);
      toast.success("تم حفظ نوع الدهان");
    }
  };

  /* ─────────── إدارة أنواع الدهان ─────────── */
  const [typesOpen, setTypesOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [addingType, setAddingType] = useState(false);

  const addType = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = newTypeName.trim();
    if (!name || addingType) return;
    setAddingType(true);
    const { data, error } = await supabase.from("paint_types")
      .insert({ name }).select("id, name, active").single();
    setAddingType(false);
    if (error) { toast.error(error.message.includes("unique") ? "النوع ده موجود قبل كده" : error.message); return; }
    setPaintTypes(prev => [...prev, data as PaintType].sort((a, b) => a.name.localeCompare(b.name)));
    setNewTypeName("");
    toast.success("تمت إضافة نوع الدهان");
  };

  const toggleType = async (t: PaintType) => {
    const { error } = await supabase.from("paint_types").update({ active: !t.active }).eq("id", t.id);
    if (error) { toast.error(error.message); return; }
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

  const activeTypesCount = paintTypes.filter(t => t.active).length;
  const visibleReady = visible.reduce((a, it) => a + avail(it), 0);
  const typeSingle = typeTargets && typeTargets.length === 1 ? items.find(it => it.id === typeTargets[0]) : undefined;

  const emptyAction = paintTypes.length === 0
    ? (
      <button type="button" onClick={() => setTypesOpen(true)} className="eg-btn-primary eg-btn-sm">
        <Settings className="size-3.5" />أنواع الدهان
      </button>
    )
    : filtersActive
      ? <button type="button" onClick={clearFilters} className="eg-btn-ghost eg-btn-sm">مسح الفلاتر</button>
      : !showWaiting && stats.waiting > 0
        ? (
          <button type="button" onClick={() => setShowWaiting(true)} className="eg-btn-ghost eg-btn-sm">
            <Hourglass className="size-3.5" />عرض المنتظر من الصاج
          </button>
        )
        : undefined;

  return (
    <Page width="full">
      <PageHeader
        title="متابعة قسم الدهان"
        icon={Paintbrush}
        meta={<LiveBadge live={live} hint={live ? "متصل — التحديث لحظي" : "غير متصل"} />}
        subtitle="الأجزاء اللي اتستلمت من الصاج ومحتاجة دهان، مرتبة حسب نوع الدهان"
        actions={
          <button type="button" onClick={() => setTypesOpen(true)} className="eg-btn-ghost eg-btn-sm">
            <Settings className="size-3.5" />أنواع الدهان
          </button>
        }
      />

      <PageBody>
        {newItemsPending && (
          <div role="status" className="eg-card flex animate-fade-in flex-wrap items-center gap-3 border-accent/40 bg-accent/[0.04] !py-3">
            <Info className="size-4 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 text-sm text-text">فيه بنود جديدة اتضافت</span>
            <button type="button" onClick={() => window.location.reload()} className="eg-btn-primary eg-btn-sm">
              <RefreshCw className="size-3.5" />تحديث
            </button>
          </div>
        )}

        {/* كروت الملخص */}
        <div className="eg-stagger grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard title="جاهز للدهان الآن" main={stats.ready} mainLabel="قطعة مستلمة من الصاج"
            sub={`${stats.items} بند`} accent />
          <SummaryCard title="إجمالي المتبقي" main={stats.remaining} mainLabel="قطعة لسه ماتدهنتش"
            second={stats.noType} secondLabel="بند بدون نوع دهان" />
          <SummaryCard title="بانتظار الصاج" main={stats.waiting} mainLabel="قطعة لسه ماتستلمتش"
            second={stats.late} secondLabel="أمر متأخر" secondWarn />
          <SummaryCard title="أنواع الدهان" main={activeTypesCount} mainLabel="نوع نشط"
            sub={`${paintTypes.length} إجمالي`} />
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
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              aria-label="نوع الدهان" title="نوع الدهان" className="eg-select eg-input-sm w-40">
              <option value="الكل">كل أنواع الدهان</option>
              <option value="none">بدون نوع</option>
              {paintTypes.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <span aria-hidden className="mx-0.5 hidden h-5 w-px bg-border sm:block" />
            <FilterChip active={lateOnly} onClick={() => setLateOnly(v => !v)} count={stats.late || undefined} tone="danger">
              <AlertTriangle className="size-3.5" />المتأخر فقط
            </FilterChip>
            <FilterChip active={grouped} onClick={() => setGroupOverride(!grouped)}>
              <Layers className="size-3.5" />تجميع بنوع الدهان
            </FilterChip>
            <FilterChip active={showWaiting} onClick={() => setShowWaiting(v => !v)}>عرض المنتظر من الصاج</FilterChip>
            {visible.length > 0 && (
              <span className="ms-auto whitespace-nowrap text-xs tabular-nums text-subtext">
                {visible.length} بند · {fmt(visibleReady)} قطعة جاهزة
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
                    <th className="w-28">الخامة / السُمك</th>
                    <th className="w-40">نوع الدهان</th>
                    <th className="w-20">المطلوب</th>
                    <th className="w-20">من الصاج</th>
                    <th className="w-20">اتدهن</th>
                    <th className="w-24">المتاح</th>
                    <th className="w-28">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <Fragment key={g.key}>
                      {grouped && (
                        <tr className="bg-card2/60">
                          <td colSpan={11} className="!py-2">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold", g.key === "none" ? "text-warning" : "text-text")}>
                                {g.key === "none"
                                  ? <AlertTriangle className="size-3.5" />
                                  : <Paintbrush className="size-3.5 text-muted" />}
                                {g.label}
                              </span>
                              <span className="text-[11px] tabular-nums text-subtext">
                                {g.items.length} بند · {fmt(g.items.reduce((a, it) => a + avail(it), 0))} قطعة جاهزة
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {g.items.map(it => {
                        const wo = getWO(it);
                        const late = isLate(it);
                        const a = avail(it);
                        const isSelected = selected.has(it.id);
                        return (
                          <tr key={it.id} className={cn(isSelected && "bg-accent/[0.06]", a <= 0 && "opacity-50")}>
                            <td>
                              <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(it.id)}
                                aria-label={`تحديد ${it.description}`} />
                            </td>
                            <td><WoCell wo={wo} late={late} /></td>
                            <td className="whitespace-normal break-words text-text">{it.description}</td>
                            <td className="font-mono text-xs text-subtext">{it.part_no ?? "—"}</td>
                            <td className="text-xs text-subtext">{it.sheet_steel ?? "—"} / {it.thickness ?? "—"}</td>
                            <td>
                              {it.paint_type_id != null
                                ? <Badge label={typeName(it.paint_type_id)} tone="accent" dot={false} />
                                : <Badge label="بدون نوع" tone="warning" dot={false} />}
                            </td>
                            <td className="tabular-nums text-subtext">{fmt(it.qty)}</td>
                            <td className="tabular-nums text-text">{fmt(it.qty_sheet ?? 0)}</td>
                            <td className="tabular-nums font-medium text-success">{fmt(it.qty_paint ?? 0)}</td>
                            <td className="tabular-nums">
                              <span className={cn("font-bold", a > 0 ? "text-warning" : "text-subtext")}>{fmt(a)}</span>
                              {waitingSheet(it) > 0 && (
                                <div className="text-[11px] text-subtext">+{fmt(waitingSheet(it))} منتظرة الصاج</div>
                              )}
                            </td>
                            <td>
                              <div className="flex items-center gap-1.5">
                                <button type="button" onClick={() => openLog(it)} disabled={a <= 0} className="eg-btn-primary eg-btn-xs">
                                  تسجيل دهان
                                </button>
                                {(it.qty_paint ?? 0) === 0 && (
                                  <Tooltip content="تغيير نوع الدهان">
                                    <button type="button" onClick={() => openType([it.id])} aria-label="تغيير نوع الدهان" className="eg-icon-btn">
                                      <Paintbrush className="size-3.5" />
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
              message={paintTypes.length === 0
                ? "ابدأ بإضافة أنواع الدهان من زرار «أنواع الدهان»"
                : "مفيش أجزاء جاهزة للدهان دلوقتي"}
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
              <button type="button" onClick={() => openType(Array.from(selected))} className="eg-btn-primary eg-btn-sm">
                <Paintbrush className="size-3.5" />تحديد نوع الدهان
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="eg-btn-ghost eg-btn-sm">إلغاء التحديد</button>
            </div>
          </div>
        )}
      </PageBody>

      {/* ── مودال تسجيل الدهان ── */}
      <Modal open={!!logItem} onClose={() => setLogItem(null)} title="تسجيل دهان">
        {logItem && (
          <form noValidate onSubmit={submitLog} className="space-y-4">
            <div className="space-y-2 rounded-lg border border-border/70 bg-card2/60 p-3">
              <p className="text-sm font-medium leading-6 text-text">{logItem.description}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtext">
                <span>أمر الشغل: <span className="font-mono text-text">{getWO(logItem)?.wo_number ?? "—"}</span></span>
                <span>نوع الدهان: <b className="font-semibold text-accent">{typeName(logItem.paint_type_id)}</b></span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtext">
                <span>المستلم من الصاج: <span className="tabular-nums text-text">{fmt(logItem.qty_sheet)}</span></span>
                <span>اتدهن: <span className="tabular-nums text-text">{fmt(logItem.qty_paint)}</span></span>
                <span>المتاح: <b className="tabular-nums text-warning">{fmt(avail(logItem))}</b></span>
              </div>
            </div>

            <Field label="الكمية" required htmlFor="paint-log-qty">
              <div className="flex gap-2">
                <input id="paint-log-qty" type="number" inputMode="decimal" min="0.01" step="any" value={logQty} autoFocus
                  onChange={e => setLogQty(e.target.value)} className="eg-input min-w-0 flex-1" />
                <button type="button" onClick={() => setLogQty(String(avail(logItem)))} className="eg-btn-ghost shrink-0">
                  الكل (<span className="tabular-nums">{fmt(avail(logItem))}</span>)
                </button>
              </div>
            </Field>

            <Field label="ملاحظة" htmlFor="paint-log-note">
              <input id="paint-log-note" value={logNote} onChange={e => setLogNote(e.target.value)} className="eg-input" />
            </Field>

            <FormError>{logError}</FormError>
            <button type="submit" disabled={logging || !logQty} className="eg-btn-success w-full">
              {logging ? <Spinner /> : <Check className="size-4" />}
              {logging ? "جاري التسجيل..." : "تأكيد"}
            </button>
          </form>
        )}
      </Modal>

      {/* ── مودال نوع الدهان ── */}
      <Modal open={!!typeTargets} onClose={() => setTypeTargets(null)}
        title={typeTargets && typeTargets.length > 1 ? `نوع دهان ${typeTargets.length} بند` : "نوع الدهان"}
        description={typeSingle?.description}>
        <form noValidate onSubmit={saveType} className="space-y-4">
          <Field label="نوع الدهان" htmlFor="paint-type-select"
            hint={activeTypesCount === 0 ? "لازم تضيف نوع دهان الأول من «أنواع الدهان»" : undefined}>
            <select id="paint-type-select" value={typeDraft} onChange={e => setTypeDraft(e.target.value)} className="eg-select">
              <option value="">— بدون نوع —</option>
              {paintTypes.filter(t => t.active || String(t.id) === typeDraft).map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.active ? "" : " (متعطل)"}</option>
              ))}
            </select>
          </Field>

          <p className="flex items-start gap-1.5 text-[11px] leading-5 text-subtext">
            <Lock className="mt-0.5 size-3 shrink-0 text-muted" />
            مايتغيرش النوع بعد ما الدهان يبدأ على البند.
          </p>

          {typeMsg && (
            <p role="status" className="animate-fade-in rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
              {typeMsg}
            </p>
          )}
          <FormError>{typeError}</FormError>

          <button type="submit" disabled={typeSaving} className="eg-btn-primary w-full">
            {typeSaving ? <Spinner /> : <Check className="size-4" />}
            {typeSaving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </form>
      </Modal>

      {/* ── مودال أنواع الدهان ── */}
      <Modal open={typesOpen} onClose={() => setTypesOpen(false)} title="أنواع الدهان">
        <div className="space-y-4">
          <form onSubmit={addType} className="flex gap-2">
            <input value={newTypeName} onChange={e => setNewTypeName(e.target.value)}
              aria-label="اسم نوع الدهان" className="eg-input min-w-0 flex-1" placeholder="اسم نوع الدهان (مثال: RAL 9010 مات)" />
            <button type="submit" disabled={addingType || !newTypeName.trim()} className="eg-btn-primary shrink-0">
              {addingType ? <Spinner /> : <Plus className="size-4" />}إضافة
            </button>
          </form>

          {paintTypes.length > 0 ? (
            <div className="space-y-1.5">
              {paintTypes.map(t => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card2/50 px-3 py-2">
                  <span className={cn("min-w-0 flex-1 truncate text-sm", t.active ? "text-text" : "text-subtext line-through")}>{t.name}</span>
                  <button type="button" onClick={() => toggleType(t)}
                    className={cn(t.active ? "eg-btn-danger-soft" : "eg-btn-ghost", "eg-btn-xs w-14")}>
                    {t.active ? "تعطيل" : "تفعيل"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={Palette} message="لا توجد أنواع دهان بعد" />
          )}

          <p className="flex items-start gap-1.5 text-[11px] leading-5 text-subtext">
            <Info className="mt-0.5 size-3 shrink-0 text-muted" />
            التعطيل بيخفي النوع من الاختيار بس، والبنود القديمة اللي عليه بتفضل زي ما هي.
          </p>
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

// كارت ملخص: رقم كبير + رقم تاني اختياري بفاصل (تحت بعض على الموبايل، جنب بعض من sm)
function SummaryCard({ title, main, mainLabel, second, secondLabel, secondWarn, sub, accent }: {
  title: string; main: number; mainLabel: string; second?: number; secondLabel?: string;
  secondWarn?: boolean; sub?: string; accent?: boolean;
}) {
  return (
    <div className={cn("eg-card flex flex-col !p-4", accent && "border-accent/40")}>
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <span className="text-sm font-semibold leading-5 text-text">{title}</span>
        {sub && <span className="text-[11px] leading-5 tabular-nums text-subtext">{sub}</span>}
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
        <div className="min-w-0">
          <div className={cn(
            "text-2xl font-bold leading-8 tracking-tight tabular-nums",
            main > 0 ? (accent ? "text-warning" : "text-text") : "text-subtext",
          )}>
            {fmt(main)}
          </div>
          <div className="text-[11px] leading-4 text-subtext">{mainLabel}</div>
        </div>
        {second !== undefined && (
          <div className="flex min-w-0 items-baseline gap-1.5 border-t border-border/70 pt-2 sm:block sm:border-s sm:border-t-0 sm:ps-4 sm:pt-0">
            <div className={cn(
              "text-lg font-bold leading-7 tracking-tight tabular-nums sm:text-2xl sm:leading-8",
              secondWarn && second > 0 ? "text-danger" : second > 0 ? "text-text" : "text-subtext",
            )}>
              {fmt(second)}
            </div>
            <div className="text-[11px] leading-4 text-subtext">{secondLabel}</div>
          </div>
        )}
      </div>
    </div>
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
