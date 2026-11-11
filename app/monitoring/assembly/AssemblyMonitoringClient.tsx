"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { Search, Users, Plus, X, Check, Save } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════ ثوابت ═══════════════ */

// حالات قسم التجميع الميكانيكي (بتتخزن كما هي في wo_department_status)
export const MECH_STATUSES = [
  { key: "New", label: "جديد", cls: "bg-card2 text-subtext" },
  { key: "Partially Ready", label: "جاهز جزئياً", cls: "bg-accent/15 text-accent" },
  { key: "Ready to Start", label: "جاهز للبدء", cls: "bg-success/15 text-success" },
  { key: "In Progress", label: "جاري", cls: "bg-accent/25 text-accent" },
  { key: "Partially Blocked", label: "متعطل جزئياً", cls: "bg-warning/15 text-warning" },
  { key: "Blocked", label: "متعطل", cls: "bg-danger/15 text-danger" },
  { key: "Packing", label: "تعبئة", cls: "bg-accent/15 text-accent" },
  { key: "Finished", label: "منتهي", cls: "bg-success/25 text-success" },
  { key: "Closed", label: "مغلق", cls: "bg-card2 text-subtext" },
] as const;
const STATUS_LABEL: Record<string, string> = Object.fromEntries(MECH_STATUSES.map(s => [s.key, s.label]));
const STATUS_CLS: Record<string, string> = Object.fromEntries(MECH_STATUSES.map(s => [s.key, s.cls]));

const pct = (done: number, req: number) => (req > 0 ? Math.min(100, Math.round((done / req) * 100)) : 0);
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));
const fmtTime = (iso: string) => new Date(iso).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });

/* ═══════════════ الكومبوننت ═══════════════ */

export default function AssemblyMonitoringClient({
  items, prod, boms, shortages, groups, members, itemAssembly, mechStatus, history, techs, canEdit,
}: {
  items: any[]; prod: any[]; boms: any[]; shortages: any[]; groups: any[]; members: any[];
  itemAssembly: any[]; mechStatus: any[]; history: any[]; techs: any[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // بنود متحددة لتسجيلها على جروب واحد
  const [bulkSel, setBulkSel] = useState<Set<number>>(new Set());
  const [bulkGroup, setBulkGroup] = useState("");

  // فلاتر
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("الكل");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [priorityFilter, setPriorityFilter] = useState("الكل");
  const [shortageFilter, setShortageFilter] = useState("الكل");
  const [deliveredFilter, setDeliveredFilter] = useState("الكل");
  // إخفاء البنود المنتهية (منتهي / مغلق) من الجدول — الـ KPI بتفضل بالعدد الكامل
  const [hideFinished, setHideFinished] = useState(false);

  const flash = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    setTimeout(() => setNotice(null), 3000);
  };

  const run = async (fn: () => PromiseLike<{ error: any }>, okText: string) => {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) { flash(false, error.message); return false; }
    flash(true, okText);
    router.refresh();
    return true;
  };

  /* ═══════════════ حسابات البند ═══════════════ */

  const groupById = useMemo(() => new Map(groups.map(g => [g.id, g])), [groups]);
  const statusByItem = useMemo(() => new Map(mechStatus.map(m => [m.item_id, m.status])), [mechStatus]);
  const assemblyByItem = useMemo(() => new Map(itemAssembly.map(a => [a.item_id, a])), [itemAssembly]);

  const rows = useMemo(() => items.map(it => {
    const P = prod.filter(p => p.work_order_item_id === it.id);
    const B = boms.filter(b => b.work_order_item_id === it.id);
    const open = shortages.filter(s => s.item_id === it.id && !s.resolved_at);

    const sheetReq = P.reduce((a, p) => a + (p.qty ?? 0), 0);
    const sheetRec = P.reduce((a, p) => a + Math.min(p.qty_sheet ?? 0, p.qty ?? 0), 0);
    const bomReq = B.reduce((a, b) => a + (b.qty ?? 0), 0);
    const bomIss = B.reduce((a, b) => a + Math.min(b.qty_dispensed ?? 0, b.qty ?? 0), 0);
    const asmReq = P.reduce((a, p) => a + (p.qty ?? 0), 0);
    const asmDone = P.reduce((a, p) => a + Math.min(p.qty_assembly ?? 0, p.qty ?? 0), 0);

    const sheetPct = pct(sheetRec, sheetReq);
    const bomPct = pct(bomIss, bomReq);
    const asmPct = pct(asmDone, asmReq);
    const missingSheet = P.filter(p => (p.qty_sheet ?? 0) < (p.qty ?? 0)).length;
    const missingBom = B.filter(b => (b.qty_dispensed ?? 0) < (b.qty ?? 0)).length;

    // الحالات القديمة (زي "لم يبدأ") بتتحول لـ "جديد" لأن القسم الميكانيكي بيستخدم حالاته المحددة بس
    const rawStatus = statusByItem.get(it.id);
    const current = MECH_STATUSES.some(m => m.key === rawStatus) ? (rawStatus as string) : "New";
    const asm = assemblyByItem.get(it.id);
    const grp = asm?.group_id ? groupById.get(asm.group_id) : null;

    return {
      id: it.id,
      woId: it.wo_id,
      woNumber: it.work_order?.wo_number ?? "—",
      client: it.work_order?.client_name ?? "",
      project: it.work_order?.project_name ?? "",
      label: `#${it.item_no}`,
      description: it.description ?? "",
      qty: it.qty ?? 0,
      priority: it.priority ?? "متوسطة",
      due: it.expected_delivery,
      sheetPct, bomPct, asmPct, sheetReq, sheetRec, bomReq, bomIss, asmReq, asmDone,
      missingSheet, missingBom,
      openShortages: open.length,
      current,
      suggested: suggest(current, asmPct, asmDone, asmReq, sheetPct, bomPct, open.length),
      groupId: asm?.group_id ?? null,
      groupName: grp?.name ?? "—",
      supervisor: grp?.supervisor_id ? (techs.find(t => t.id === grp.supervisor_id)?.name ?? "—") : "—",
      delivered: asm?.customer_delivered_at ?? null,
      deliveryNotes: asm?.delivery_notes ?? null,
      lastUpdate: lastUpdate(it.id),
      groupMembers: asm?.group_id
        ? members.filter(m => m.group_id === asm.group_id).map(m => m.technician?.name).filter(Boolean).join("، ")
        : "",
      P, B, open,
    };
  }), [items, prod, boms, shortages, statusByItem, assemblyByItem, groupById, techs]);

  function lastUpdate(itemId: number): string | null {
    const h = history.find(x => x.item_id === itemId);
    const s = shortages.find(x => x.item_id === itemId);
    const dates = [h?.changed_at, s?.created_at, s?.resolved_at].filter(Boolean) as string[];
    return dates.length ? dates.sort().slice(-1)[0] : null;
  }

  // الحالة المقترحة من التقدم والنواقص (المستخدم يقدر يطبقها)
  function suggest(cur: string, asmPct: number, asmDone: number, asmReq: number, sheetPct: number, bomPct: number, open: number) {
    if (["Packing", "Finished", "Closed"].includes(cur)) return cur;
    if (asmReq > 0 && asmDone >= asmReq) return "Finished";
    if (asmDone > 0) return open > 0 ? "Partially Blocked" : "In Progress";
    if (sheetPct === 100 && bomPct === 100 && open === 0) return "Ready to Start";
    if (sheetPct === 0 && bomPct === 0) return open > 0 ? "Blocked" : "New";
    return open > 0 ? "Partially Blocked" : "Partially Ready";
  }

  /* ═══════════════ الفلاتر و الـ KPI ═══════════════ */

  const filtered = useMemo(() => rows.filter(r => {
    if (search) {
      const hay = `${r.woNumber} ${r.description} ${r.client} ${r.project}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    if (groupFilter !== "الكل" && String(r.groupId ?? "none") !== groupFilter) return false;
    if (statusFilter !== "الكل" && r.current !== statusFilter) return false;
    if (priorityFilter !== "الكل" && r.priority !== priorityFilter) return false;
    if (shortageFilter === "فيه نواقص" && r.openShortages === 0) return false;
    if (shortageFilter === "مفيش نواقص" && r.openShortages > 0) return false;
    if (deliveredFilter === "اتسلم" && !r.delivered) return false;
    if (deliveredFilter === "لسه" && r.delivered) return false;
    if (hideFinished && ["Finished", "Closed"].includes(r.current)) return false;
    return true;
  }).sort((a, b) => {
    const rank = (r: any) => (r.openShortages > 0 ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (a.due ?? "9999").localeCompare(b.due ?? "9999");
  }), [rows, search, groupFilter, statusFilter, priorityFilter, shortageFilter, deliveredFilter]);

  const kpi = useMemo(() => {
    const c = (fn: (r: any) => boolean) => rows.filter(fn).length;
    return {
      open: c(r => !["Finished", "Closed"].includes(r.current)),
      inProgress: c(r => r.current === "In Progress"),
      partBlocked: c(r => r.current === "Partially Blocked"),
      blocked: c(r => r.current === "Blocked"),
      finished: c(r => r.current === "Finished"),
      packing: c(r => r.current === "Packing"),
      waitSheet: c(r => r.sheetPct < 100),
      waitBom: c(r => r.bomPct < 100),
    };
  }, [rows]);

  const selected = rows.find(r => r.id === selectedId) ?? null;

  /* ═══════════════ الإجراءات ═══════════════ */

  const setStatus = (r: any, status: string) =>
    run(() => supabase.rpc("set_item_department_status", { p_item_id: r.id, p_dept: "MECH_ASSEMBLY", p_status: status }),
      `الحالة: ${STATUS_LABEL[status]}`);

  const assignGroup = (r: any, groupId: string) =>
    run(() => supabase.from("item_assembly").upsert({ item_id: r.id, group_id: groupId ? Number(groupId) : null }, { onConflict: "item_id" }),
      "اتحدّد الجروب");

  const saveDelivery = (r: any, date: string, note: string) =>
    run(() => supabase.from("item_assembly").upsert({
      item_id: r.id, customer_delivered_at: date || null, delivery_notes: note.trim() || null,
    }, { onConflict: "item_id" }), "اتحفظ التسليم للعميل");

  const setProgress = (prodId: number, qty: number) =>
    run(() => supabase.rpc("set_assembly_progress", { p_prod_id: prodId, p_qty: qty }), "اتحدّث التقدم");

  const addShortage = (r: any, source: "sheet" | "bom", sourceId: number, qty: number, note: string) =>
    run(() => supabase.from("assembly_shortages").insert({
      item_id: r.id, source, source_id: sourceId, qty, note: note.trim() || null,
    }), "اتضاف النقص");

  const resolveShortage = (id: number) =>
    run(() => supabase.from("assembly_shortages").update({ resolved_at: new Date().toISOString() }).eq("id", id), "اتقفل النقص");

  /* ═══════════════ العرض ═══════════════ */

  return (
    <div className="max-w-7xl mx-auto">
      {/* ═══ الهيدر ═══ */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border/60 px-4 md:px-6 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-text">متابعة التجميع الميكانيكي</h1>
            <p className="text-[11px] text-subtext">{filtered.length} من {rows.length} بند معتمد</p>
          </div>
          <div className="flex items-center gap-2">
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtext" />
            <input value={search} onChange={e => setSearch(e.target.value)} className="eg-input !py-1.5 !text-xs pr-8 w-52" placeholder="بحث بالأمر أو الوصف أو العميل" />
          </div>
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} className="eg-select !py-1.5 !text-xs w-36">
            <option value="الكل">كل الجروبات</option>
            <option value="none">بدون جروب</option>
            {groups.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="eg-select !py-1.5 !text-xs w-40">
            <option value="الكل">كل الحالات</option>
            {MECH_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="eg-select !py-1.5 !text-xs w-32">
            <option value="الكل">كل الأولويات</option>
            {["عاجلة", "عالية", "متوسطة", "منخفضة"].map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={shortageFilter} onChange={e => setShortageFilter(e.target.value)} className="eg-select !py-1.5 !text-xs w-32">
            <option value="الكل">كل النواقص</option>
            <option>فيه نواقص</option>
            <option>مفيش نواقص</option>
          </select>
          <select value={deliveredFilter} onChange={e => setDeliveredFilter(e.target.value)} className="eg-select !py-1.5 !text-xs w-36">
            <option value="الكل">التسليم للعميل</option>
            <option value="لسه">لسه ماتسلمش</option>
            <option value="اتسلم">اتسلم</option>
          </select>
          <button type="button" onClick={() => setHideFinished(v => !v)} aria-pressed={hideFinished}
            className={`eg-btn-ghost !py-1.5 !text-xs ${hideFinished ? "!border-accent !text-accent" : ""}`}>
            {hideFinished ? "إظهار المنتهي" : "إخفاء المنتهي"}
          </button>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {canEdit && bulkSel.size > 0 && (
          <div className="eg-card flex flex-wrap items-center gap-3 !p-3">
            <span className="text-sm text-text">تم تحديد <span className="font-bold tabular-nums">{bulkSel.size}</span> بند</span>
            <select value={bulkGroup} onChange={e => setBulkGroup(e.target.value)} disabled={busy}
              aria-label="اختار الجروب" className="eg-select !py-1.5 !text-xs w-56">
              <option value="">— اختار الجروب —</option>
              {groups.filter(g => g.active !== false).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button type="button" disabled={busy || !bulkGroup}
              onClick={async () => {
                const ok = await run(() => supabase.from("item_assembly").upsert(
                  Array.from(bulkSel).map(id => ({ item_id: id, group_id: Number(bulkGroup) })),
                  { onConflict: "item_id" }
                ), `اتسجلت ${bulkSel.size} بند على الجروب`);
                if (ok) { setBulkSel(new Set()); setBulkGroup(""); }
              }}
              className="eg-btn-primary !py-1.5 !text-xs disabled:opacity-40">
              تسجيل على الجروب
            </button>
            <button type="button" onClick={() => setBulkSel(new Set())} className="eg-btn-ghost !py-1.5 !text-xs">إلغاء التحديد</button>
          </div>
        )}
        {notice && (
          <div className={cn("text-xs px-3 py-2 rounded-lg border",
            notice.ok ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger")}>
            {notice.text}
          </div>
        )}

        {/* ═══ KPI ═══ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="بنود مفتوحة" value={kpi.open} />
          <Kpi label="جاري" value={kpi.inProgress} tone="accent" />
          <Kpi label="متعطل جزئياً" value={kpi.partBlocked} tone="warning" />
          <Kpi label="متعطل" value={kpi.blocked} tone="danger" />
          <Kpi label="منتهي" value={kpi.finished} tone="success" />
          <Kpi label="في التعبئة" value={kpi.packing} tone="accent" />
          <Kpi label="منتظر صاج" value={kpi.waitSheet} tone="warning" />
          <Kpi label="منتظر BOM" value={kpi.waitBom} tone="warning" />
        </div>

        {/* ═══ الجدول ═══ */}
        <div className="eg-card !p-0 overflow-hidden">
          {filtered.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[1100px]">
                <thead>
                  <tr className="bg-card2 text-subtext">
                    {canEdit && (
                      <th className="w-10 px-3 py-2">
                        <input type="checkbox" aria-label="تحديد كل البنود المعروضة"
                          checked={filtered.length > 0 && filtered.every(r => bulkSel.has(r.id))}
                          onChange={e => setBulkSel(e.target.checked ? new Set(filtered.map(r => r.id)) : new Set())}
                          className="size-4 cursor-pointer" />
                      </th>
                    )}
                    <th className="px-3 py-2 text-right font-semibold">الأمر</th>
                    <th className="px-3 py-2 text-right font-semibold">البند</th>
                    <th className="px-3 py-2 text-center font-semibold">الكمية</th>
                    <th className="px-3 py-2 text-right font-semibold">الجروب</th>
                    <th className="px-3 py-2 text-right font-semibold">المشرف</th>
                    <th className="px-3 py-2 text-right font-semibold">الحالة</th>
                    <th className="px-3 py-2 text-center font-semibold">الصاج</th>
                    <th className="px-3 py-2 text-center font-semibold">BOM</th>
                    <th className="px-3 py-2 text-center font-semibold">التجميع</th>
                    <th className="px-3 py-2 text-center font-semibold">نواقص</th>
                    <th className="px-3 py-2 text-right font-semibold">الأولوية</th>
                    <th className="px-3 py-2 text-right font-semibold">الاستحقاق</th>
                    <th className="px-3 py-2 text-right font-semibold">التسليم للعميل</th>
                    <th className="px-3 py-2 text-right font-semibold">آخر تحديث</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} onClick={() => setSelectedId(r.id)}
                      className={cn("border-t border-border/40 cursor-pointer hover:bg-card2/50", r.openShortages > 0 && "bg-warning/5")}>
                      {canEdit && (
                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" aria-label={`تحديد ${r.woNumber} ${r.label}`}
                            checked={bulkSel.has(r.id)}
                            onChange={() => setBulkSel(prev => {
                              const n = new Set(prev); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n;
                            })}
                            className="size-4 cursor-pointer" />
                        </td>
                      )}
                      <td className="px-3 py-2 font-mono font-semibold text-accent">{r.woNumber}</td>
                      <td className="px-3 py-2"><div className="text-text">{r.label} {r.description}</div>
                        {(r.client || r.project) && <div className="text-[10px] text-subtext truncate max-w-[220px]">{[r.client, r.project].filter(Boolean).join(" · ")}</div>}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{fmt(r.qty)}</td>
                      <td className="px-3 py-2">{r.groupName}</td>
                      <td className="px-3 py-2 text-subtext">{r.supervisor}</td>
                      <td className="px-3 py-2">
                        <span className={cn("text-[11px] px-2 py-0.5 rounded", STATUS_CLS[r.current])}>{STATUS_LABEL[r.current] ?? r.current}</span>
                        {r.suggested !== r.current && <div className="text-[10px] text-accent mt-0.5">مقترح: {STATUS_LABEL[r.suggested]}</div>}
                      </td>
                      <td className="px-3 py-2"><Bar pct={r.sheetPct} /></td>
                      <td className="px-3 py-2"><Bar pct={r.bomPct} /></td>
                      <td className="px-3 py-2"><Bar pct={r.asmPct} /></td>
                      <td className="px-3 py-2 text-center">
                        {r.openShortages > 0
                          ? <span className="text-[11px] px-2 py-0.5 rounded bg-danger/15 text-danger font-semibold">{r.openShortages}</span>
                          : <span className="text-subtext">—</span>}
                      </td>
                      <td className="px-3 py-2">{r.priority}</td>
                      <td className="px-3 py-2 tabular-nums text-subtext">{r.due ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums">{r.delivered ? <span className="text-success">{r.delivered}</span> : <span className="text-subtext">—</span>}</td>
                      <td className="px-3 py-2 tabular-nums text-subtext">{r.lastUpdate ? fmtTime(r.lastUpdate) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState message={rows.length ? "مفيش بنود مطابقة للفلاتر" : "مفيش بنود معتمدة لمتابعة التجميع"} />}
        </div>
      </div>

      {/* ═══ تفاصيل البند ═══ */}
      <Modal open={!!selected} onClose={() => setSelectedId(null)} title={selected ? `${selected.woNumber} · ${selected.label} ${selected.description}` : ""} size="md">
        {selected && (
          <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
            {/* A: معلومات البند */}
            <Section title="أ. معلومات البند">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Info label="الكمية" value={fmt(selected.qty)} />
                <Info label="الأولوية" value={selected.priority} />
                <Info label="الاستحقاق" value={selected.due ?? "—"} />
                <Info label="العميل / المشروع" value={[selected.client, selected.project].filter(Boolean).join(" · ") || "—"} />
                <Info label="الجروب" value={selected.groupName} />
                <Info label="أعضاء الجروب" value={selected.groupMembers || "—"} />
                <Info label="المشرف" value={selected.supervisor} />
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-3">
                <span className="text-[11px] text-subtext">الحالة:</span>
                {canEdit ? (
                  <select value={selected.current} disabled={busy} onChange={e => setStatus(selected, e.target.value)} className="eg-select !py-1 !text-xs w-44">
                    {MECH_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                ) : <Badge label={STATUS_LABEL[selected.current] ?? selected.current} />}
                {canEdit && selected.suggested !== selected.current && (
                  <button onClick={() => setStatus(selected, selected.suggested)} disabled={busy} className="eg-btn-ghost !py-1 !text-[11px]">
                    تطبيق المقترح ({STATUS_LABEL[selected.suggested]})
                  </button>
                )}
              </div>
              {canEdit && (
                <div className="mt-3">
                  <label className="block text-[11px] text-subtext mb-1">الجروب</label>
                  <select value={selected.groupId ?? ""} disabled={busy} onChange={e => assignGroup(selected, e.target.value)} className="eg-select !py-1 !text-xs w-56">
                    <option value="">— بدون جروب —</option>
                    {groups.filter(g => g.active !== false).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}
            </Section>

            {/* B: الصاج */}
            <Section title={`ب. الصاج — جاهز ${selected.sheetPct}%`}>
              <Progress pct={selected.sheetPct} />
              {selected.P.length ? (
                <table className="w-full text-xs mt-3">
                  <thead><tr className="text-subtext"><th className="text-right py-1">الجزء</th><th className="text-center">المطلوب</th><th className="text-center">المستلم</th><th className="text-center">الناقص</th></tr></thead>
                  <tbody>
                    {selected.P.map((p: any) => (
                      <tr key={p.id} className="border-t border-border/40">
                        <td className="py-1 text-text">{p.description}</td>
                        <td className="text-center tabular-nums">{fmt(p.qty)}</td>
                        <td className="text-center tabular-nums">{fmt(p.qty_sheet ?? 0)}</td>
                        <td className={cn("text-center tabular-nums", (p.qty_sheet ?? 0) < p.qty && "text-danger font-semibold")}>{fmt(Math.max(0, p.qty - (p.qty_sheet ?? 0)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-[11px] text-subtext mt-2">مفيش بنود صاج مربوطة بالبند ده</p>}
            </Section>

            {/* C: BOM */}
            <Section title={`ج. BOM — مصروف ${selected.bomPct}%`}>
              <Progress pct={selected.bomPct} />
              {selected.B.length ? (
                <table className="w-full text-xs mt-3">
                  <thead><tr className="text-subtext"><th className="text-right py-1">الصنف</th><th className="text-center">المطلوب</th><th className="text-center">المصروف</th><th className="text-center">الناقص</th></tr></thead>
                  <tbody>
                    {selected.B.map((b: any) => (
                      <tr key={b.id} className="border-t border-border/40">
                        <td className="py-1 text-text">{b.description}</td>
                        <td className="text-center tabular-nums">{fmt(b.qty)} {b.unit ?? ""}</td>
                        <td className="text-center tabular-nums">{fmt(b.qty_dispensed ?? 0)}</td>
                        <td className={cn("text-center tabular-nums", (b.qty_dispensed ?? 0) < b.qty && "text-danger font-semibold")}>{fmt(Math.max(0, b.qty - (b.qty_dispensed ?? 0)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="text-[11px] text-subtext mt-2">مفيش BOM مربوط بالبند ده</p>}
            </Section>

            {/* D: التنفيذ */}
            <Section title={`د. التنفيذ — ${selected.asmPct}%`}>
              <Progress pct={selected.asmPct} />
              {selected.P.length ? (
                <div className="mt-3 space-y-2">
                  {selected.P.map((p: any) => (
                    <ProgressRow key={p.id} label={p.description} max={p.qty} value={p.qty_assembly ?? 0} disabled={!canEdit || busy}
                      onSave={v => setProgress(p.id, v)} />
                  ))}
                </div>
              ) : <p className="text-[11px] text-subtext mt-2">مفيش بنود إنتاج للبند ده</p>}
            </Section>

            {/* النواقص */}
            <Section title={`النواقص (${selected.open.length} مفتوح)`}>
              {selected.open.length ? (
                <ul className="space-y-2">
                  {selected.open.map((s: any) => {
                    const label = s.source === "sheet"
                      ? (selected.P.find((p: any) => p.id === s.source_id)?.description ?? "صاج")
                      : (selected.B.find((b: any) => b.id === s.source_id)?.description ?? "BOM");
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-2 text-xs bg-danger/5 border border-danger/20 rounded-md px-3 py-2">
                        <div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-card2 text-subtext ml-2">{s.source === "sheet" ? "صاج" : "BOM"}</span>
                          <span className="text-text">{label}</span>
                          <span className="text-danger font-semibold mr-2">× {fmt(s.qty)}</span>
                          {s.note && <div className="text-[10px] text-subtext mt-0.5">{s.note}</div>}
                        </div>
                        {canEdit && (
                          <button onClick={() => resolveShortage(s.id)} disabled={busy} className="text-success hover:underline shrink-0">
                            <Check className="w-3.5 h-3.5 inline" /> تم
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-[11px] text-subtext">مفيش نواقص مفتوحة</p>}
              {canEdit && <ShortageForm item={selected} busy={busy} onAdd={(src, id, q, n) => addShortage(selected, src, id, q, n)} />}
            </Section>

            {/* E: التسليم للعميل */}
            <Section title="هـ. التسليم للعميل">
              <DeliveryForm key={selected.id} item={selected} disabled={!canEdit || busy}
                onSave={(d, n) => saveDelivery(selected, d, n)} />
            </Section>

            {/* F: سجل الأحداث */}
            <Section title="و. سجل الأحداث">
              <Timeline item={selected} history={history} shortages={shortages} />
            </Section>
          </div>
        )}
      </Modal>

      {/* ═══ إدارة الجروبات ═══ */}

    </div>
  );
}

/* ═══════════════ مكونات مساعدة ═══════════════ */

function Kpi({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "accent" | "warning" | "danger" | "success" }) {
  const T: Record<string, string> = { default: "text-text", accent: "text-accent", warning: "text-warning", danger: "text-danger", success: "text-success" };
  return (
    <div className="eg-card !p-3">
      <div className={cn("text-xl font-bold tabular-nums", T[tone])}>{value}</div>
      <div className="text-[11px] text-subtext mt-0.5">{label}</div>
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="min-w-[90px]">
      <div className="flex justify-between text-[10px] text-subtext mb-0.5"><span className="tabular-nums">{pct}%</span></div>
      <div className="h-1.5 rounded-full bg-card2 overflow-hidden">
        <div className={cn("h-full", pct >= 100 ? "bg-success" : pct > 0 ? "bg-accent" : "bg-border")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Progress({ pct }: { pct: number }) {
  return (
    <div className="h-2 rounded-full bg-card2 overflow-hidden">
      <div className={cn("h-full transition-all", pct >= 100 ? "bg-success" : "bg-accent")} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold text-text border-b border-border/50 pb-1">{title}</h3>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card2 rounded-md px-3 py-2">
      <div className="text-[10px] text-subtext">{label}</div>
      <div className="text-text text-xs">{value}</div>
    </div>
  );
}

function ProgressRow({ label, max, value, disabled, onSave }: { label: string; max: number; value: number; disabled: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex-1 text-text truncate">{label}</div>
      <input type="number" min={0} max={max} step="any" value={v} disabled={disabled}
        onChange={e => setV(e.target.value)} className="eg-input !py-1 !px-2 !text-xs w-20 text-center" />
      <span className="text-subtext tabular-nums">/ {fmt(max)}</span>
      <button disabled={disabled || Number(v) === value} onClick={() => onSave(Number(v))} className="eg-btn-ghost !py-1 !px-2 !text-[11px] disabled:opacity-40">
        <Save className="w-3 h-3" />
      </button>
    </div>
  );
}

function ShortageForm({ item, busy, onAdd }: { item: any; busy: boolean; onAdd: (src: "sheet" | "bom", id: number, qty: number, note: string) => void }) {
  const [src, setSrc] = useState<"sheet" | "bom">("bom");
  const [srcId, setSrcId] = useState("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const list = src === "sheet" ? item.P : item.B;
  return (
    <div className="grid grid-cols-12 gap-2 items-end pt-2 border-t border-border/40 mt-2">
      <div className="col-span-3">
        <label className="block text-[10px] text-subtext mb-1">المصدر</label>
        <select value={src} onChange={e => { setSrc(e.target.value as any); setSrcId(""); }} className="eg-select !py-1 !text-xs">
          <option value="bom">BOM</option>
          <option value="sheet">صاج</option>
        </select>
      </div>
      <div className="col-span-4">
        <label className="block text-[10px] text-subtext mb-1">الصنف</label>
        <select value={srcId} onChange={e => setSrcId(e.target.value)} className="eg-select !py-1 !text-xs">
          <option value="">— اختار —</option>
          {list.map((x: any) => <option key={x.id} value={x.id}>{x.description}</option>)}
        </select>
      </div>
      <div className="col-span-1">
        <label className="block text-[10px] text-subtext mb-1">الكمية</label>
        <input type="number" min="0.01" step="any" value={qty} onChange={e => setQty(e.target.value)} className="eg-input !py-1 !text-xs" />
      </div>
      <div className="col-span-3">
        <label className="block text-[10px] text-subtext mb-1">ملاحظة</label>
        <input value={note} onChange={e => setNote(e.target.value)} className="eg-input !py-1 !text-xs" />
      </div>
      <div className="col-span-1">
        <button disabled={busy || !srcId || !(parseFloat(qty) > 0)}
          onClick={() => { onAdd(src, Number(srcId), parseFloat(qty), note); setSrcId(""); setNote(""); setQty("1"); }}
          className="eg-btn-primary !py-1 !px-2 w-full justify-center disabled:opacity-40">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function DeliveryForm({ item, disabled, onSave }: { item: any; disabled: boolean; onSave: (d: string, n: string) => void }) {
  const [date, setDate] = useState(item.delivered ?? "");
  const [note, setNote] = useState(item.deliveryNotes ?? "");
  return (
    <div className="grid grid-cols-12 gap-2 items-end">
      <div className="col-span-4">
        <label className="block text-[10px] text-subtext mb-1">تاريخ التسليم للعميل</label>
        <input type="date" value={date} disabled={disabled} onChange={e => setDate(e.target.value)} className="eg-input !py-1 !text-xs" />
      </div>
      <div className="col-span-6">
        <label className="block text-[10px] text-subtext mb-1">ملاحظات</label>
        <input value={note} disabled={disabled} onChange={e => setNote(e.target.value)} className="eg-input !py-1 !text-xs" />
      </div>
      <div className="col-span-2">
        <button disabled={disabled} onClick={() => onSave(date, note)} className="eg-btn-success !py-1 !text-xs w-full justify-center">
          <Save className="w-3.5 h-3.5" />حفظ
        </button>
      </div>
    </div>
  );
}

function Timeline({ item, history, shortages }: { item: any; history: any[]; shortages: any[] }) {
  const events: { at: string; text: string }[] = [];
  history.filter(h => h.item_id === item.id).forEach(h => {
    events.push({
      at: h.changed_at,
      text: `${h.user?.full_name || h.user?.email || "نظام"} غيّر الحالة من ${STATUS_LABEL[h.from_status] ?? h.from_status ?? "—"} إلى ${STATUS_LABEL[h.to_status] ?? h.to_status}`,
    });
  });
  shortages.filter(s => s.item_id === item.id).forEach(s => {
    events.push({ at: s.created_at, text: `اتضاف نقص: ${s.note ?? (s.source === "sheet" ? "صاج" : "BOM")} × ${s.qty}` });
    if (s.resolved_at) events.push({ at: s.resolved_at, text: `اتقفل نقص: ${s.note ?? (s.source === "sheet" ? "صاج" : "BOM")}` });
  });
  if (item.delivered) events.push({ at: `${item.delivered}T00:00:00`, text: `اتسلم للعميل${item.deliveryNotes ? ` — ${item.deliveryNotes}` : ""}` });
  events.sort((a, b) => b.at.localeCompare(a.at));
  if (!events.length) return <p className="text-[11px] text-subtext">مفيش أحداث بعد</p>;
  return (
    <ul className="space-y-1.5 max-h-60 overflow-y-auto">
      {events.map((e, i) => (
        <li key={i} className="flex gap-3 text-xs">
          <span className="text-subtext tabular-nums whitespace-nowrap">{fmtTime(e.at)}</span>
          <span className="text-text">{e.text}</span>
        </li>
      ))}
    </ul>
  );
}
