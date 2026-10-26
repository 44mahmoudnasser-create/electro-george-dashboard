"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Field from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import Tooltip from "@/components/ui/Tooltip";
import { Page, PageHeader, PageBody } from "@/components/ui/Page";
import { StatCard, ProgressBar } from "@/components/ui/StatCard";
import { SearchInput } from "@/components/ui/Filters";
import { useToast } from "@/components/ui/Toast";
import { toneFor } from "@/lib/status";
import {
  Cog, Users, Plus, X, Check, Save, ChevronLeft, Sparkles, Power, PowerOff,
  ClipboardList, PlayCircle, AlertTriangle, Ban, CheckCircle2, Package, Layers, Boxes, SearchX,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════ ثوابت ═══════════════ */

// حالات قسم التجميع الميكانيكي (بتتخزن كما هي في wo_department_status) — ألوانها متعرفة في lib/status.ts
export const MECH_STATUSES = [
  { key: "New", label: "جديد" },
  { key: "Partially Ready", label: "جاهز جزئياً" },
  { key: "Ready to Start", label: "جاهز للبدء" },
  { key: "In Progress", label: "جاري" },
  { key: "Partially Blocked", label: "متعطل جزئياً" },
  { key: "Blocked", label: "متعطل" },
  { key: "Packing", label: "تعبئة" },
  { key: "Finished", label: "منتهي" },
  { key: "Closed", label: "مغلق" },
] as const;
const STATUS_LABEL: Record<string, string> = Object.fromEntries(MECH_STATUSES.map(s => [s.key, s.label]));
const PRIORITIES = ["عاجلة", "عالية", "متوسطة", "منخفضة"];

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
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);

  // فلاتر
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("الكل");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [priorityFilter, setPriorityFilter] = useState("الكل");
  const [shortageFilter, setShortageFilter] = useState("الكل");
  const [deliveredFilter, setDeliveredFilter] = useState("الكل");

  const flash = (ok: boolean, text: string) => toast.show(ok, text);

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
    return true;
  }).sort((a, b) => {
    const rank = (r: any) => (r.openShortages > 0 ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    return (a.due ?? "9999").localeCompare(b.due ?? "9999");
  }), [rows, search, groupFilter, statusFilter, priorityFilter, shortageFilter, deliveredFilter]);

  const filtersActive = !!search || groupFilter !== "الكل" || statusFilter !== "الكل" || priorityFilter !== "الكل" ||
    shortageFilter !== "الكل" || deliveredFilter !== "الكل";
  const clearFilters = () => {
    setSearch(""); setGroupFilter("الكل"); setStatusFilter("الكل");
    setPriorityFilter("الكل"); setShortageFilter("الكل"); setDeliveredFilter("الكل");
  };

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
    <Page width="7xl">
      <PageHeader
        title="متابعة التجميع الميكانيكي"
        icon={Cog}
        subtitle={<span className="tabular-nums">{filtered.length} من {rows.length} بند معتمد</span>}
        actions={canEdit ? (
          <button type="button" onClick={() => setGroupsOpen(true)} className="eg-btn-ghost eg-btn-sm">
            <Users className="size-3.5" />الجروبات
          </button>
        ) : undefined}
      >
        {/* الفلاتر */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="بحث بالأمر أو الوصف أو العميل" className="w-full sm:w-60" />
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} aria-label="الجروب" className="eg-select eg-input-sm w-36">
            <option value="الكل">كل الجروبات</option>
            <option value="none">بدون جروب</option>
            {groups.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="الحالة" className="eg-select eg-input-sm w-40">
            <option value="الكل">كل الحالات</option>
            {MECH_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} aria-label="الأولوية" className="eg-select eg-input-sm w-32">
            <option value="الكل">كل الأولويات</option>
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={shortageFilter} onChange={e => setShortageFilter(e.target.value)} aria-label="النواقص" className="eg-select eg-input-sm w-32">
            <option value="الكل">كل النواقص</option>
            <option>فيه نواقص</option>
            <option>مفيش نواقص</option>
          </select>
          <select value={deliveredFilter} onChange={e => setDeliveredFilter(e.target.value)} aria-label="التسليم للعميل" className="eg-select eg-input-sm w-36">
            <option value="الكل">التسليم للعميل</option>
            <option value="لسه">لسه ماتسلمش</option>
            <option value="اتسلم">اتسلم</option>
          </select>
          {filtersActive && (
            <button type="button" onClick={clearFilters} className="eg-btn-subtle eg-btn-xs">
              <X className="size-3" />مسح الفلاتر
            </button>
          )}
        </div>
      </PageHeader>

      <PageBody>
        {/* ═══ KPI ═══ */}
        <div className="eg-stagger grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="بنود مفتوحة" value={kpi.open} icon={ClipboardList} />
          <StatCard label="جاري" value={kpi.inProgress} tone="accent" icon={PlayCircle} />
          <StatCard label="متعطل جزئياً" value={kpi.partBlocked} tone="warning" icon={AlertTriangle} />
          <StatCard label="متعطل" value={kpi.blocked} tone="danger" icon={Ban} />
          <StatCard label="منتهي" value={kpi.finished} tone="success" icon={CheckCircle2} />
          <StatCard label="في التعبئة" value={kpi.packing} tone="accent" icon={Package} />
          <StatCard label="منتظر صاج" value={kpi.waitSheet} tone="warning" icon={Layers} />
          <StatCard label="منتظر BOM" value={kpi.waitBom} tone="warning" icon={Boxes} />
        </div>

        {/* ═══ الجدول ═══ */}
        <div className="eg-card overflow-hidden !p-0">
          {filtered.length ? (
            <div className="overflow-x-auto">
              <table className="eg-table min-w-[1100px]">
                <thead>
                  <tr>
                    <th>الأمر</th>
                    <th>البند</th>
                    <th className="text-center">الكمية</th>
                    <th>الجروب</th>
                    <th>المشرف</th>
                    <th>الحالة</th>
                    <th className="text-center">الصاج</th>
                    <th className="text-center">BOM</th>
                    <th className="text-center">التجميع</th>
                    <th className="text-center">نواقص</th>
                    <th>الأولوية</th>
                    <th>الاستحقاق</th>
                    <th>التسليم للعميل</th>
                    <th>آخر تحديث</th>
                    <th className="w-8"><span className="sr-only">فتح</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} onClick={() => setSelectedId(r.id)}
                      className={cn("group cursor-pointer", r.openShortages > 0 && "bg-warning/[0.05]")}>
                      <td>
                        <button type="button" onClick={e => { e.stopPropagation(); setSelectedId(r.id); }}
                          className="whitespace-nowrap font-mono text-[13px] font-semibold text-accent underline-offset-4 hover:underline">
                          {r.woNumber}
                        </button>
                      </td>
                      <td className="min-w-[200px] max-w-[300px]">
                        <div className="leading-5 text-text">
                          <span className="tabular-nums text-subtext">{r.label}</span> {r.description}
                        </div>
                        {(r.client || r.project) && (
                          <div className="max-w-[220px] truncate text-[11px] text-subtext">{[r.client, r.project].filter(Boolean).join(" · ")}</div>
                        )}
                      </td>
                      <td className="text-center tabular-nums">{fmt(r.qty)}</td>
                      <td className="whitespace-nowrap">{r.groupName === "—" ? <span className="text-muted">—</span> : r.groupName}</td>
                      <td className="whitespace-nowrap text-subtext">{r.supervisor}</td>
                      <td>
                        <Badge label={STATUS_LABEL[r.current] ?? r.current} tone={toneFor(r.current)} />
                        {r.suggested !== r.current && (
                          <div className="mt-1 whitespace-nowrap text-[11px] text-accent">مقترح: {STATUS_LABEL[r.suggested]}</div>
                        )}
                      </td>
                      <td><PctCell value={r.sheetPct} label="الصاج" /></td>
                      <td><PctCell value={r.bomPct} label="BOM" /></td>
                      <td><PctCell value={r.asmPct} label="التجميع" /></td>
                      <td className="text-center">
                        {r.openShortages > 0
                          ? <Badge label={String(r.openShortages)} tone="danger" dot={false} className="font-semibold tabular-nums" />
                          : <span className="text-muted">—</span>}
                      </td>
                      <td><Badge label={r.priority} dot={false} /></td>
                      <td className="tabular-nums text-subtext">{r.due ?? "—"}</td>
                      <td className="tabular-nums">
                        {r.delivered ? <span className="text-success">{r.delivered}</span> : <span className="text-muted">—</span>}
                      </td>
                      <td className="tabular-nums text-subtext">{r.lastUpdate ? fmtTime(r.lastUpdate) : "—"}</td>
                      <td className="text-muted transition-colors group-hover:text-accent">
                        <ChevronLeft className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={rows.length ? SearchX : Cog}
              message={rows.length ? "مفيش بنود مطابقة للفلاتر" : "مفيش بنود معتمدة لمتابعة التجميع"}
              description={rows.length ? "غيّر الفلاتر أو امسح البحث علشان تشوف باقي البنود." : undefined}
              action={rows.length && filtersActive
                ? <button type="button" onClick={clearFilters} className="eg-btn-ghost eg-btn-sm">مسح الفلاتر</button>
                : undefined}
            />
          )}
        </div>
      </PageBody>

      {/* ═══ تفاصيل البند ═══ */}
      <Modal open={!!selected} onClose={() => setSelectedId(null)} size="lg"
        title={selected ? <><span className="font-mono">{selected.woNumber}</span> · {selected.label} {selected.description}</> : ""}>
        {selected && (
          <div className="space-y-6">
            {/* A: معلومات البند */}
            <Section title="أ. معلومات البند">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Info label="الكمية" value={<span className="tabular-nums">{fmt(selected.qty)}</span>} />
                <Info label="الأولوية" value={<Badge label={selected.priority} dot={false} />} />
                <Info label="الاستحقاق" value={<span className="tabular-nums">{selected.due ?? "—"}</span>} />
                <Info label="العميل / المشروع" value={[selected.client, selected.project].filter(Boolean).join(" · ") || "—"} />
                <Info label="الجروب" value={selected.groupName} />
                <Info label="المشرف" value={selected.supervisor} />
              </div>
              {canEdit ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="الحالة" htmlFor="asm-status">
                    <select id="asm-status" value={selected.current} disabled={busy}
                      onChange={e => setStatus(selected, e.target.value)} className="eg-select eg-input-sm">
                      {MECH_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    {selected.suggested !== selected.current && (
                      <button type="button" onClick={() => setStatus(selected, selected.suggested)} disabled={busy}
                        className="eg-btn-ghost eg-btn-xs mt-2">
                        <Sparkles className="size-3 text-accent" />تطبيق المقترح ({STATUS_LABEL[selected.suggested]})
                      </button>
                    )}
                  </Field>
                  <Field label="الجروب" htmlFor="asm-group">
                    <select id="asm-group" value={selected.groupId ?? ""} disabled={busy}
                      onChange={e => assignGroup(selected, e.target.value)} className="eg-select eg-input-sm">
                      <option value="">— بدون جروب —</option>
                      {groups.filter(g => g.active).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </Field>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-subtext">الحالة:</span>
                  <Badge label={STATUS_LABEL[selected.current] ?? selected.current} tone={toneFor(selected.current)} />
                </div>
              )}
            </Section>

            {/* B: الصاج */}
            <Section title="ب. الصاج" meta={<PctMeta value={selected.sheetPct} prefix="جاهز" />}>
              <ProgressBar value={selected.sheetPct} tone={selected.sheetPct >= 100 ? "success" : "accent"} label="الصاج" className="h-2" />
              {selected.P.length ? (
                <SubTable head={["الجزء", "المطلوب", "المستلم", "الناقص"]}>
                  {selected.P.map((p: any) => (
                    <tr key={p.id}>
                      <td className="text-text">{p.description}</td>
                      <td className="text-center tabular-nums">{fmt(p.qty)}</td>
                      <td className="text-center tabular-nums">{fmt(p.qty_sheet ?? 0)}</td>
                      <td className={cn("text-center tabular-nums", (p.qty_sheet ?? 0) < p.qty ? "font-semibold text-danger" : "text-subtext")}>
                        {fmt(Math.max(0, p.qty - (p.qty_sheet ?? 0)))}
                      </td>
                    </tr>
                  ))}
                </SubTable>
              ) : <EmptyNote>مفيش بنود صاج مربوطة بالبند ده</EmptyNote>}
            </Section>

            {/* C: BOM */}
            <Section title="ج. BOM" meta={<PctMeta value={selected.bomPct} prefix="مصروف" />}>
              <ProgressBar value={selected.bomPct} tone={selected.bomPct >= 100 ? "success" : "accent"} label="BOM" className="h-2" />
              {selected.B.length ? (
                <SubTable head={["الصنف", "المطلوب", "المصروف", "الناقص"]}>
                  {selected.B.map((b: any) => (
                    <tr key={b.id}>
                      <td className="text-text">{b.description}</td>
                      <td className="text-center tabular-nums">{fmt(b.qty)} {b.unit ?? ""}</td>
                      <td className="text-center tabular-nums">{fmt(b.qty_dispensed ?? 0)}</td>
                      <td className={cn("text-center tabular-nums", (b.qty_dispensed ?? 0) < b.qty ? "font-semibold text-danger" : "text-subtext")}>
                        {fmt(Math.max(0, b.qty - (b.qty_dispensed ?? 0)))}
                      </td>
                    </tr>
                  ))}
                </SubTable>
              ) : <EmptyNote>مفيش BOM مربوط بالبند ده</EmptyNote>}
            </Section>

            {/* D: التنفيذ */}
            <Section title="د. التنفيذ" meta={<PctMeta value={selected.asmPct} />}>
              <ProgressBar value={selected.asmPct} tone={selected.asmPct >= 100 ? "success" : "accent"} label="التنفيذ" className="h-2" />
              {selected.P.length ? (
                <div className="divide-y divide-border/50 rounded-lg border border-border/60">
                  {selected.P.map((p: any) => (
                    <ProgressRow key={p.id} label={p.description} max={p.qty} value={p.qty_assembly ?? 0} disabled={!canEdit || busy}
                      onSave={v => setProgress(p.id, v)} />
                  ))}
                </div>
              ) : <EmptyNote>مفيش بنود إنتاج للبند ده</EmptyNote>}
            </Section>

            {/* النواقص */}
            <Section title="النواقص"
              meta={<Badge label={`${selected.open.length} مفتوح`} tone={selected.open.length ? "danger" : "neutral"} dot={false} className="tabular-nums" />}>
              {selected.open.length ? (
                <ul className="space-y-2">
                  {selected.open.map((s: any) => {
                    const label = s.source === "sheet"
                      ? (selected.P.find((p: any) => p.id === s.source_id)?.description ?? "صاج")
                      : (selected.B.find((b: any) => b.id === s.source_id)?.description ?? "BOM");
                    return (
                      <li key={s.id} className="flex items-start justify-between gap-3 rounded-lg border border-danger/20 bg-danger/[0.06] px-3 py-2">
                        <div className="min-w-0 text-xs">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Badge label={s.source === "sheet" ? "صاج" : "BOM"} tone="neutral" dot={false} />
                            <span className="text-text">{label}</span>
                            <span className="font-semibold tabular-nums text-danger">× {fmt(s.qty)}</span>
                          </div>
                          {s.note && <p className="mt-1 text-[11px] leading-5 text-subtext">{s.note}</p>}
                        </div>
                        {canEdit && (
                          <button type="button" onClick={() => resolveShortage(s.id)} disabled={busy} className="eg-btn-success eg-btn-xs shrink-0">
                            <Check className="size-3" />تم
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : <EmptyNote>مفيش نواقص مفتوحة</EmptyNote>}
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
      <GroupsModal open={groupsOpen} onClose={() => setGroupsOpen(false)} groups={groups} members={members} techs={techs}
        onChanged={() => router.refresh()} flash={flash} />
    </Page>
  );
}

/* ═══════════════ مكونات مساعدة ═══════════════ */

// نسبة في خلية الجدول: شريط + الرقم
function PctCell({ value, label }: { value: number; label: string }) {
  const done = value >= 100;
  return (
    <div className="flex min-w-[104px] items-center gap-2">
      <ProgressBar value={value} tone={done ? "success" : "accent"} label={label} className="min-w-0 flex-1" />
      <span className={cn("w-9 shrink-0 text-end text-[11px] tabular-nums",
        done ? "font-semibold text-success" : value > 0 ? "text-text" : "text-subtext")}>
        {value}%
      </span>
    </div>
  );
}

// النسبة اللي جنب عنوان القسم في تفاصيل البند
function PctMeta({ value, prefix }: { value: number; prefix?: string }) {
  return (
    <span className={cn("text-xs tabular-nums", value >= 100 ? "font-semibold text-success" : "text-subtext")}>
      {prefix ? `${prefix} ` : ""}<span className="font-semibold">{value}%</span>
    </span>
  );
}

function Section({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {meta}
      </div>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-card2/50 px-3 py-2">
      <div className="text-[11px] leading-4 text-subtext">{label}</div>
      <div className="mt-1 truncate text-[13px] font-medium leading-5 text-text" title={typeof value === "string" ? value : undefined}>
        {value}
      </div>
    </div>
  );
}

// جدول صغير جوه تفاصيل البند (أول عمود نص والباقي أرقام)
function SubTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="eg-table eg-table-compact">
        <thead>
          <tr>{head.map((h, i) => <th key={h} className={i > 0 ? "w-20 text-center" : undefined}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-center text-xs text-subtext">{children}</p>
  );
}

function ProgressRow({ label, max, value, disabled, onSave }: { label: string; max: number; value: number; disabled: boolean; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  // بعد router.refresh() القيمة بتيجي جديدة من السيرفر — نحدّث الحقل علشان مايفضلش رقم قديم
  useEffect(() => { setV(String(value)); }, [value]);
  const unchanged = Number(v) === value;
  return (
    <form noValidate onSubmit={e => { e.preventDefault(); if (!disabled && !unchanged) onSave(Number(v)); }}
      className="flex items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1 truncate text-xs text-text" title={label}>{label}</div>
      <input type="number" min={0} max={max} step="any" value={v} disabled={disabled}
        onChange={e => setV(e.target.value)} aria-label={`كمية التجميع: ${label}`}
        className="eg-input eg-input-sm w-20 text-center" />
      <span className="shrink-0 text-xs tabular-nums text-subtext">/ {fmt(max)}</span>
      <Tooltip content="حفظ">
        <button type="submit" disabled={disabled || unchanged} aria-label="حفظ" className="eg-btn-ghost eg-btn-xs eg-btn-icon">
          <Save className="size-3.5" />
        </button>
      </Tooltip>
    </form>
  );
}

function ShortageForm({ item, busy, onAdd }: { item: any; busy: boolean; onAdd: (src: "sheet" | "bom", id: number, qty: number, note: string) => void }) {
  const id = useId();
  const [src, setSrc] = useState<"sheet" | "bom">("bom");
  const [srcId, setSrcId] = useState("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const list = src === "sheet" ? item.P : item.B;
  const invalid = !srcId || !(parseFloat(qty) > 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || invalid) return;
    onAdd(src, Number(srcId), parseFloat(qty), note); setSrcId(""); setNote(""); setQty("1");
  };

  return (
    <form noValidate onSubmit={submit} className="grid grid-cols-2 items-end gap-x-3 gap-y-2.5 border-t border-border/60 pt-3 sm:grid-cols-12">
      <Field label="المصدر" htmlFor={`${id}-src`} className="sm:col-span-3">
        <select id={`${id}-src`} value={src} onChange={e => { setSrc(e.target.value as "sheet" | "bom"); setSrcId(""); }} className="eg-select eg-input-sm">
          <option value="bom">BOM</option>
          <option value="sheet">صاج</option>
        </select>
      </Field>
      <Field label="الصنف" htmlFor={`${id}-item`} className="sm:col-span-6">
        <select id={`${id}-item`} value={srcId} onChange={e => setSrcId(e.target.value)} className="eg-select eg-input-sm">
          <option value="">— اختار —</option>
          {list.map((x: any) => <option key={x.id} value={x.id}>{x.description}</option>)}
        </select>
      </Field>
      <Field label="الكمية" htmlFor={`${id}-qty`} className="sm:col-span-3">
        <input id={`${id}-qty`} type="number" min="0.01" step="any" value={qty} onChange={e => setQty(e.target.value)} className="eg-input eg-input-sm" />
      </Field>
      <Field label="ملاحظة" htmlFor={`${id}-note`} className="sm:col-span-9">
        <input id={`${id}-note`} value={note} onChange={e => setNote(e.target.value)} className="eg-input eg-input-sm" />
      </Field>
      <button type="submit" disabled={busy || invalid} className="eg-btn-primary eg-btn-sm col-span-2 sm:col-span-3">
        <Plus className="size-3.5" />إضافة نقص
      </button>
    </form>
  );
}

function DeliveryForm({ item, disabled, onSave }: { item: any; disabled: boolean; onSave: (d: string, n: string) => void }) {
  const id = useId();
  const [date, setDate] = useState(item.delivered ?? "");
  const [note, setNote] = useState(item.deliveryNotes ?? "");
  return (
    <form noValidate onSubmit={e => { e.preventDefault(); if (!disabled) onSave(date, note); }}
      className="grid grid-cols-1 items-end gap-3 sm:grid-cols-12">
      <Field label="تاريخ التسليم للعميل" htmlFor={`${id}-date`} className="sm:col-span-4">
        <input id={`${id}-date`} type="date" value={date} disabled={disabled} onChange={e => setDate(e.target.value)} className="eg-input eg-input-sm" />
      </Field>
      <Field label="ملاحظات" htmlFor={`${id}-note`} className="sm:col-span-5">
        <input id={`${id}-note`} value={note} disabled={disabled} onChange={e => setNote(e.target.value)} className="eg-input eg-input-sm" />
      </Field>
      <button type="submit" disabled={disabled} className="eg-btn-success eg-btn-sm sm:col-span-3">
        <Save className="size-3.5" />حفظ
      </button>
    </form>
  );
}

const EVENT_DOT = { accent: "bg-accent", danger: "bg-danger", success: "bg-success" } as const;

function Timeline({ item, history, shortages }: { item: any; history: any[]; shortages: any[] }) {
  const events: { at: string; text: string; tone: keyof typeof EVENT_DOT }[] = [];
  history.filter(h => h.item_id === item.id).forEach(h => {
    events.push({
      at: h.changed_at,
      text: `${h.user?.full_name || h.user?.email || "نظام"} غيّر الحالة من ${STATUS_LABEL[h.from_status] ?? h.from_status ?? "—"} إلى ${STATUS_LABEL[h.to_status] ?? h.to_status}`,
      tone: "accent",
    });
  });
  shortages.filter(s => s.item_id === item.id).forEach(s => {
    events.push({ at: s.created_at, text: `اتضاف نقص: ${s.note ?? (s.source === "sheet" ? "صاج" : "BOM")} × ${s.qty}`, tone: "danger" });
    if (s.resolved_at) events.push({ at: s.resolved_at, text: `اتقفل نقص: ${s.note ?? (s.source === "sheet" ? "صاج" : "BOM")}`, tone: "success" });
  });
  if (item.delivered) events.push({ at: `${item.delivered}T00:00:00`, text: `اتسلم للعميل${item.deliveryNotes ? ` — ${item.deliveryNotes}` : ""}`, tone: "success" });
  events.sort((a, b) => b.at.localeCompare(a.at));
  if (!events.length) return <EmptyNote>مفيش أحداث بعد</EmptyNote>;
  return (
    <ol className="max-h-64 overflow-y-auto pr-1 pt-0.5">
      {events.map((e, i) => (
        <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
          {/* الخط الواصل بين النقط */}
          {i < events.length - 1 && <span aria-hidden className="absolute -bottom-1.5 right-[4.5px] top-1.5 w-px bg-border-strong/70" />}
          <span aria-hidden className={cn("relative mt-1.5 size-2.5 shrink-0 rounded-full ring-[3px] ring-card", EVENT_DOT[e.tone])} />
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-5 text-text">{e.text}</p>
            <time dateTime={e.at} className="text-[11px] leading-4 tabular-nums text-subtext">{fmtTime(e.at)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}

function GroupsModal({ open, onClose, groups, members, techs: allTechs, onChanged, flash }: {
  open: boolean; onClose: () => void; groups: any[]; members: any[]; techs: any[];
  onChanged: () => void; flash: (ok: boolean, t: string) => void;
}) {
  // المشرفين بس (درجة مشرف) — ده اللي بيظهر وقت إنشاء الجروب وتغيير المشرف
  const techs = allTechs
    .filter(t => t.grade === "مشرف")
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
  // الأعضاء: كل الفنيين اللي المستخدم شايفهم (المشرفين + فنيين قسمه)
  const memberCandidates = [...allTechs].sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
  const id = useId();
  const [name, setName] = useState("");
  const [sup, setSup] = useState("");
  const [busy, setBusy] = useState(false);
  // الطلبات اللي لسه مستنية رد (علشان الزرار يتقفل ويبان عليه مؤشر لحد ما الرد يرجع)
  const [pending, setPending] = useState<string[]>([]);
  const isPending = (key: string) => pending.includes(key);
  const track = async (key: string, fn: () => Promise<void>) => {
    setPending(p => [...p, key]);
    try { await fn(); } finally { setPending(p => p.filter(k => k !== key)); }
  };

  const create = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    const { error } = await supabase.from("assembly_groups").insert({ name: name.trim(), supervisor_id: sup ? Number(sup) : null });
    setBusy(false);
    if (error) { flash(false, error.message); return; }
    setName(""); setSup(""); flash(true, "اتضاف الجروب"); onChanged();
  };

  const setSupervisor = (gid: number, tid: string) => track(`sup:${gid}`, async () => {
    const { error } = await supabase.from("assembly_groups").update({ supervisor_id: tid ? Number(tid) : null }).eq("id", gid);
    if (error) { flash(false, error.message); return; }
    onChanged();
  });

  const toggleActive = (g: any) => track(`active:${g.id}`, async () => {
    const { error } = await supabase.from("assembly_groups").update({ active: !g.active }).eq("id", g.id);
    if (error) { flash(false, error.message); return; }
    onChanged();
  });

  const toggleMember = (gid: number, tid: number, on: boolean) => track(`mem:${gid}:${tid}`, async () => {
    const { error } = on
      ? await supabase.from("assembly_group_members").delete().eq("group_id", gid).eq("tech_id", tid)
      : await supabase.from("assembly_group_members").insert({ group_id: gid, tech_id: tid });
    if (error) { flash(false, error.message); return; }
    onChanged();
  });

  return (
    <Modal open={open} onClose={onClose} title="إدارة الجروبات" size="lg">
      <div className="space-y-4">
        {/* جروب جديد */}
        <form onSubmit={create} className="rounded-xl border border-dashed border-border-strong/70 p-3">
          <p className="mb-2.5 text-xs font-semibold text-text">جروب جديد</p>
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Field label="اسم الجروب" required htmlFor={`${id}-name`}>
              <input id={`${id}-name`} value={name} onChange={e => setName(e.target.value)} className="eg-input eg-input-sm" />
            </Field>
            <Field label="المشرف" htmlFor={`${id}-sup`}>
              <select id={`${id}-sup`} value={sup} onChange={e => setSup(e.target.value)} className="eg-select eg-input-sm">
                <option value="">— المشرف —</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <button type="submit" disabled={busy || !name.trim()} className="eg-btn-primary eg-btn-sm">
              {busy ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />}إضافة
            </button>
          </div>
        </form>

        {groups.map(g => {
          const mem = members.filter(m => m.group_id === g.id);
          const activeBusy = isPending(`active:${g.id}`);
          return (
            <div key={g.id} className={cn("space-y-3 rounded-xl border border-border/70 bg-card2/40 p-3", !g.active && "opacity-60")}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-text">{g.name}</span>
                  {!g.active && <Badge label="معطّل" tone="neutral" dot={false} />}
                </div>
                <button type="button" onClick={() => toggleActive(g)} disabled={activeBusy} className="eg-btn-subtle eg-btn-xs shrink-0">
                  {activeBusy ? <Spinner className="size-3" /> : g.active ? <PowerOff className="size-3" /> : <Power className="size-3" />}
                  {g.active ? "تعطيل" : "تفعيل"}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`${id}-sup-${g.id}`} className="text-xs text-subtext">المشرف:</label>
                <select id={`${id}-sup-${g.id}`} value={g.supervisor_id ?? ""} disabled={isPending(`sup:${g.id}`)}
                  onChange={e => setSupervisor(g.id, e.target.value)} className="eg-select eg-input-sm w-56 max-w-full">
                  <option value="">— بدون مشرف —</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-subtext">الأعضاء <span className="tabular-nums">({mem.length})</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {memberCandidates.map(t => {
                    const on = mem.some(m => m.tech_id === t.id);
                    const waiting = isPending(`mem:${g.id}:${t.id}`);
                    return (
                      <button key={t.id} type="button" onClick={() => toggleMember(g.id, t.id, on)} disabled={waiting} aria-pressed={on}
                        className={cn("eg-chip disabled:cursor-wait disabled:opacity-60", on && "eg-chip-active")}>
                        {waiting ? <Spinner className="size-3" /> : on ? <Check className="size-3" /> : <Plus className="size-3" />}
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
        {!groups.length && <EmptyState compact icon={Users} message="مفيش جروبات بعد" />}
      </div>
    </Modal>
  );
}
