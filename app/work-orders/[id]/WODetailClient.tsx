"use client";
import { useMemo, useState } from "react";
import type { ClipboardEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { ChevronRight, Save, Plus, X, Pencil, Trash2 } from "lucide-react";
import { today, cn } from "@/lib/utils";
import { deptLabel } from "@/lib/roles";

const STATUSES = ["لم يبدأ", "جاري", "متوقف", "مكتمل", "تم التسليم"];
const PRIORITIES = ["منخفضة", "متوسطة", "عالية", "عاجلة"];
const DONE = ["مكتمل", "تم التسليم"];
const PRIORITY_STYLE: Record<string, string> = {
  "عاجلة": "bg-danger/15 text-danger",
  "عالية": "bg-warning/15 text-warning",
  "متوسطة": "bg-accent/15 text-accent",
  "منخفضة": "bg-card2 text-subtext",
};
const CHECKLIST = [
  { key: "chk_client", label: "استلمه العميل" },
  { key: "chk_quality", label: "استلمه قسم الجودة" },
  { key: "chk_assembly", label: "تم الانتهاء من التجميع الكهربي" },
] as const;
const PROD_STAGES = [
  { key: "sheet", col: "qty_sheet", label: "الصاج" },
  { key: "paint", col: "qty_paint", label: "الدهان" },
  { key: "assembly", col: "qty_assembly", label: "التجميع" },
] as const;
type StageKey = "sheet" | "paint" | "assembly";
type Tab = "prod" | "files" | "purchases" | "prodlist" | "bom";

// بيقسم نص Excel المنسوخ لصفوف وخلايا، ويحترم الخلايا اللي فيها أسطر جديدة بين علامتي تنصيص
const parseExcelClipboard = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const clean = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  while (i < clean.length) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === "\t") { row.push(cell); cell = ""; i++; continue; }
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += ch; i++;
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
};

const PROD_COLS = ["qty", "description", "part_no", "sheet_steel", "thickness"] as const;
type ProdDraft = { qty: string; description: string; part_no: string; sheet_steel: string; thickness: string; required_painting: "YES" | "NA" };
const emptyProdDraft = (): ProdDraft => ({ qty: "1", description: "", part_no: "", sheet_steel: "", thickness: "", required_painting: "YES" });

const BOM_COLS = ["s_no", "qty", "unit", "description", "part_no", "remark"] as const;
type BomDraft = { s_no: string; qty: string; unit: string; description: string; part_no: string; remark: string };
const emptyBomDraft = (): BomDraft => ({ s_no: "", qty: "1", unit: "", description: "", part_no: "", remark: "" });

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

export default function WODetailClient({
  wo, productivity, files, purchases, initialProdItems, initialBomItems, role, department,
}: {
  wo: any; productivity: any[]; files: any[]; purchases: any[];
  initialProdItems: any[];
  initialBomItems: any[]; role: string; department: string | null;
}) {
  const router = useRouter();
  const todayStr = today();
  const canManageLists = role === "manager";

  /* ─────────── بيانات الأمر (تعديل) ─────────── */
  const [status, setStatus] = useState<string>(wo.status);
  const [delivery, setDelivery] = useState<string>(wo.expected_delivery ?? "");
  const [priority, setPriority] = useState<string>(wo.priority ?? "متوسطة");
  const [planMonth, setPlanMonth] = useState<string>(wo.plan_month ?? "");
  const [desc, setDesc] = useState<string>(wo.description ?? "");
  const [checks, setChecks] = useState({
    chk_client: !!wo.chk_client, chk_quality: !!wo.chk_quality, chk_assembly: !!wo.chk_assembly,
  });
  const [dirtyInfo, setDirtyInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<Tab>("prod");

  const flash = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    setTimeout(() => setNotice(null), 3000);
  };

  const isLate = !!delivery && delivery < todayStr && !DONE.includes(status);

  const saveInfo = async () => {
    setSaving(true);
    const patch: any = {
      status, expected_delivery: delivery || null, priority, plan_month: planMonth || null,
      description: desc.trim() || null, ...checks,
    };
    if (status === "مكتمل" && !wo.completion_date) patch.completion_date = todayStr;
    const { error } = await supabase.from("work_orders").update(patch).eq("id", wo.id);
    setSaving(false);
    if (error) { flash(false, error.message); return; }
    setDirtyInfo(false);
    flash(true, "تم حفظ بيانات الأمر");
    router.refresh();
  };

  const setInfo = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirtyInfo(true); };

  /* ─────────── قائمة إنتاج الأمر ─────────── */
  const [prodItems, setProdItems] = useState<any[]>(initialProdItems);
  const [draftRows, setDraftRows] = useState<ProdDraft[]>([emptyProdDraft()]);
  const [savingProdList, setSavingProdList] = useState(false);
  const [editProdItem, setEditProdItem] = useState<any>(null);
  const [editProdForm, setEditProdForm] = useState<ProdDraft>(emptyProdDraft());
  const [logStage, setLogStage] = useState<{ item: any; stage: StageKey } | null>(null);
  const [logQty, setLogQty] = useState("");
  const [logging, setLogging] = useState(false);

  const prodTotals = useMemo(() => {
    const qty = prodItems.reduce((a, it) => a + (it.qty ?? 0), 0);
    const sum = (k: string) => prodItems.reduce((a, it) => a + (it[k] ?? 0), 0);
    return { qty, sheet: sum("qty_sheet"), paint: sum("qty_paint"), assembly: sum("qty_assembly") };
  }, [prodItems]);

  const openLogStage = (item: any, stage: StageKey) => { setLogStage({ item, stage }); setLogQty(""); };

  const submitLogStage = async () => {
    if (!logStage) return;
    const q = parseFloat(logQty);
    if (!q || q <= 0) { flash(false, "أدخل كمية صحيحة"); return; }
    setLogging(true);
    const { error } = await supabase.rpc("log_production", {
      p_item_id: logStage.item.id, p_stage: logStage.stage, p_qty: q, p_note: null,
    });
    setLogging(false);
    if (error) { flash(false, error.message); return; }
    const col = `qty_${logStage.stage}`;
    setProdItems(prev => prev.map(it => it.id === logStage.item.id ? { ...it, [col]: (it[col] ?? 0) + q } : it));
    setLogStage(null);
  };

  const handleProdPaste = (e: ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = parseExcelClipboard(text);
    setDraftRows(prev => {
      const updated = [...prev];
      lines.forEach((cells, i) => {
        const t = rowIdx + i;
        while (updated.length <= t) updated.push(emptyProdDraft());
        const row: any = { ...updated[t] };
        cells.forEach((val, j) => { const c = PROD_COLS[colIdx + j]; if (c) row[c] = val.trim(); });
        updated[t] = row;
      });
      return updated;
    });
  };

  const updateProdDraft = (idx: number, patch: Partial<ProdDraft>) =>
    setDraftRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeProdDraft = (idx: number) =>
    setDraftRows(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyProdDraft()]));

  const saveProdList = async () => {
    const rows = draftRows.filter(r => r.description.trim()).map(r => ({
      work_order_id: wo.id,
      qty: parseFloat(r.qty) || 1,
      description: r.description.trim(),
      part_no: r.part_no.trim() || null,
      sheet_steel: r.sheet_steel.trim() || null,
      thickness: r.thickness.trim() || null,
      required_painting: r.required_painting,
    }));
    if (rows.length === 0) return;
    setSavingProdList(true);
    const { data, error } = await supabase.from("wo_production_items").insert(rows).select("*");
    setSavingProdList(false);
    if (error) { flash(false, error.message); return; }
    setProdItems(prev => [...prev, ...(data ?? [])]);
    setDraftRows([emptyProdDraft()]);
    flash(true, `تم إضافة ${rows.length} بند`);
  };

  const openEditProdItem = (item: any) => {
    setEditProdItem(item);
    setEditProdForm({
      qty: String(item.qty), description: item.description, part_no: item.part_no ?? "",
      sheet_steel: item.sheet_steel ?? "", thickness: item.thickness ?? "",
      required_painting: item.required_painting ?? "YES",
    });
  };

  const submitEditProdItem = async () => {
    if (!editProdItem) return;
    const payload = {
      qty: parseFloat(editProdForm.qty) || 1,
      description: editProdForm.description.trim(),
      part_no: editProdForm.part_no.trim() || null,
      sheet_steel: editProdForm.sheet_steel.trim() || null,
      thickness: editProdForm.thickness.trim() || null,
      required_painting: editProdForm.required_painting,
    };
    const { error } = await supabase.from("wo_production_items").update(payload).eq("id", editProdItem.id);
    if (error) { flash(false, error.message); return; }
    setProdItems(prev => prev.map(it => (it.id === editProdItem.id ? { ...it, ...payload } : it)));
    setEditProdItem(null);
  };

  const removeProdItem = async (itemId: number) => {
    if (!confirm("حذف هذا الصف من قائمة الإنتاج؟")) return;
    const { error } = await supabase.from("wo_production_items").delete().eq("id", itemId);
    if (error) { flash(false, error.message); return; }
    setProdItems(prev => prev.filter(it => it.id !== itemId));
  };

  /* ─────────── BOM ─────────── */
  const [bomItems, setBomItems] = useState<any[]>(initialBomItems);
  const [bomDraftRows, setBomDraftRows] = useState<BomDraft[]>([emptyBomDraft()]);
  const [savingBomList, setSavingBomList] = useState(false);
  const [editBomItem, setEditBomItem] = useState<any>(null);
  const [editBomForm, setEditBomForm] = useState<BomDraft>(emptyBomDraft());
  const [dispenseItem, setDispenseItem] = useState<any>(null);
  // المدير مش مرتبط بقسم، فبيختار القسم اللي البنود دي بتاعته
  const [bomDept, setBomDept] = useState("");
  const bomDeptEffective = role === "manager" ? bomDept : (department ?? "");
  const [dispenseQty, setDispenseQty] = useState("");
  const [dispensing, setDispensing] = useState(false);

  const handleBomPaste = (e: ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = parseExcelClipboard(text);
    setBomDraftRows(prev => {
      const updated = [...prev];
      lines.forEach((cells, i) => {
        const t = rowIdx + i;
        while (updated.length <= t) updated.push(emptyBomDraft());
        const row: any = { ...updated[t] };
        cells.forEach((val, j) => { const c = BOM_COLS[colIdx + j]; if (c) row[c] = val.trim(); });
        updated[t] = row;
      });
      return updated;
    });
  };

  const updateBomDraft = (idx: number, patch: Partial<BomDraft>) =>
    setBomDraftRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeBomDraft = (idx: number) =>
    setBomDraftRows(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyBomDraft()]));

  const saveBomList = async () => {
    const rows = bomDraftRows.filter(r => r.description.trim()).map(r => ({
      work_order_id: wo.id,
      s_no: r.s_no.trim() ? parseInt(r.s_no) : null,
      qty: parseFloat(r.qty) || 1,
      unit: r.unit.trim() || null,
      description: r.description.trim(),
      part_no: r.part_no.trim() || null,
      remark: r.remark.trim() || null,
      department: bomDeptEffective,
    }));
    if (rows.length === 0) return;
    setSavingBomList(true);
    const { data, error } = await supabase.from("wo_bom_items").insert(rows).select("*");
    setSavingBomList(false);
    if (error) { flash(false, error.message); return; }
    setBomItems(prev => [...prev, ...(data ?? [])]);
    setBomDraftRows([emptyBomDraft()]);
    flash(true, `تم إضافة ${rows.length} بند`);
  };

  const openEditBomItem = (item: any) => {
    setEditBomItem(item);
    setEditBomForm({
      s_no: item.s_no != null ? String(item.s_no) : "", qty: String(item.qty), unit: item.unit ?? "",
      description: item.description, part_no: item.part_no ?? "", remark: item.remark ?? "",
    });
  };

  const submitEditBomItem = async () => {
    if (!editBomItem) return;
    const payload = {
      s_no: editBomForm.s_no.trim() ? parseInt(editBomForm.s_no) : null,
      qty: parseFloat(editBomForm.qty) || 1,
      unit: editBomForm.unit.trim() || null,
      description: editBomForm.description.trim(),
      part_no: editBomForm.part_no.trim() || null,
      remark: editBomForm.remark.trim() || null,
    };
    const { error } = await supabase.from("wo_bom_items").update(payload).eq("id", editBomItem.id);
    if (error) { flash(false, error.message); return; }
    setBomItems(prev => prev.map(it => (it.id === editBomItem.id ? { ...it, ...payload } : it)));
    setEditBomItem(null);
  };

  const removeBomItem = async (itemId: number) => {
    if (!confirm("حذف هذا البند من الـ BOM؟")) return;
    const { error } = await supabase.from("wo_bom_items").delete().eq("id", itemId);
    if (error) { flash(false, error.message); return; }
    setBomItems(prev => prev.filter(it => it.id !== itemId));
  };

  const submitDispense = async () => {
    if (!dispenseItem) return;
    const q = parseFloat(dispenseQty);
    if (!q || q <= 0) { flash(false, "أدخل كمية صحيحة"); return; }
    setDispensing(true);
    const { error } = await supabase.rpc("dispense_bom_item", {
      p_bom_item_id: dispenseItem.id, p_qty: q, p_note: null,
    });
    setDispensing(false);
    if (error) { flash(false, error.message); return; }
    setBomItems(prev => prev.map(it =>
      it.id === dispenseItem.id ? { ...it, qty_dispensed: (it.qty_dispensed ?? 0) + q } : it));
    setDispenseItem(null);
  };

  const getImageUrl = (path: string) => supabase.storage.from("purchases").getPublicUrl(path).data.publicUrl;

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "prod", label: "الإنتاجية", count: productivity.length },
    { key: "prodlist", label: "قائمة الإنتاج", count: prodItems.length },
    { key: "bom", label: "BOM", count: bomItems.length },
    { key: "purchases", label: "المشتريات", count: purchases.length },
    { key: "files", label: "الملفات", count: files.length },
  ];

  return (
    <div className="max-w-7xl mx-auto">
      {/* ═══ الهيدر الثابت ═══ */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border/60 px-4 md:px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => router.push("/work-orders")} className="eg-btn-ghost !py-1.5 !px-2.5 !text-xs">
            <ChevronRight className="w-3.5 h-3.5" />الأوامر
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-lg font-bold font-mono text-text truncate">{wo.wo_number}</h1>
            <Badge label={status} />
            <span className={cn("text-[11px] px-2 py-0.5 rounded", PRIORITY_STYLE[priority] ?? PRIORITY_STYLE["منخفضة"])}>{priority}</span>
            {isLate && <span className="text-[11px] px-2 py-0.5 rounded bg-danger/15 text-danger font-semibold">متأخر</span>}
          </div>
          <div className="flex-1" />
          {dirtyInfo && <span className="text-[11px] px-2 py-0.5 rounded-full bg-warning/15 text-warning">تعديلات غير محفوظة</span>}
          <button onClick={saveInfo} disabled={saving || !dirtyInfo} className="eg-btn-success !py-1.5 !text-xs disabled:opacity-40">
            <Save className="w-3.5 h-3.5" />{saving ? "جاري الحفظ..." : "حفظ البيانات"}
          </button>
        </div>
        <p className="text-[11px] text-subtext mt-1.5">
          أُنشئ {wo.created_date ?? "—"}
          {" · "}التسليم {delivery || "—"}
          {" · "}شهر الخطة {planMonth || "—"}
          {prodItems.length > 0 && <>{" · "}الإنجاز: <span className="text-text tabular-nums">{prodTotals.assembly}/{prodTotals.qty}</span> تجميع</>}
        </p>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {notice && (
          <div className={cn("text-xs px-3 py-2 rounded-lg border",
            notice.ok ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger")}>
            {notice.text}
          </div>
        )}

        {/* ═══ بيانات الأمر ═══ */}
        <div className="eg-card !p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="الحالة">
              <select value={status} onChange={e => setInfo<string>(setStatus)(e.target.value)} className="eg-select !py-1.5 !text-xs">
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="الأولوية">
              <select value={priority} onChange={e => setInfo<string>(setPriority)(e.target.value)} className="eg-select !py-1.5 !text-xs">
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="التسليم المتوقع">
              <input type="date" value={delivery} onChange={e => setInfo<string>(setDelivery)(e.target.value)}
                className="eg-input !py-1.5 !text-xs" />
            </Field>
            <Field label="شهر الخطة">
              <input type="month" value={planMonth} onChange={e => setInfo<string>(setPlanMonth)(e.target.value)}
                className="eg-input !py-1.5 !text-xs" />
            </Field>
          </div>
          <div className="lg:col-span-4">
            <p className="text-[11px] text-subtext mb-1.5">قائمة التحقق</p>
            <div className="space-y-1.5">
              {CHECKLIST.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer text-xs text-text">
                  <input type="checkbox" checked={checks[key]}
                    onChange={e => setInfo<boolean>(v => setChecks(c => ({ ...c, [key]: v })))(e.target.checked)}
                    className="w-4 h-4 accent-emerald-500" />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ═══ وصف الأمر ═══ */}
        <div className="eg-card !p-4">
          <Field label="وصف الأمر">
            <textarea rows={3} value={desc}
              onChange={e => setInfo<string>(setDesc)(e.target.value)}
              className="eg-input !h-auto py-2 !text-xs" placeholder="المنتج، المطلوب، ملاحظات التنفيذ..." />
          </Field>
        </div>

        {/* ═══ التبويبات ═══ */}
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ key, label, count }) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn("px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors",
                tab === key ? "bg-accent/15 text-accent font-semibold" : "text-subtext hover:text-text")}>
              {label} <span className="tabular-nums opacity-70">({count})</span>
            </button>
          ))}
        </div>

        {/* ═══ الإنتاجية ═══ */}
        {tab === "prod" && (
          <DataTable empty="لا توجد سجلات إنتاجية لهذا الأمر"
            head={["الفني", "التاريخ", "المهمة", "ملاحظات"]}
            rows={productivity.map(p => [p.tech_name ?? "—", p.work_date, p.task, p.notes ?? "—"])} />
        )}

        {/* ═══ الملفات ═══ */}
        {tab === "files" && (
          <DataTable empty="لا توجد ملفات"
            head={["الملف", "النوع", "تاريخ الاستلام", "سُلِّم لـ", "تاريخ التسليم"]}
            rows={files.map(f => [f.file_name, f.file_type ?? "—", f.receive_date ?? "—", f.supervisor_name ?? "—", f.delivery_date ?? "—"])} />
        )}

        {/* ═══ المشتريات ═══ */}
        {tab === "purchases" && (
          purchases.length ? (
            <div className="eg-card !p-0 overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead><tr className="bg-card2 text-subtext">
                  {["الصنف", "الكمية", "الطلب", "التوريد", "الحالة", "الصورة"].map(h => (
                    <th key={h} className="px-4 py-2 text-right font-semibold">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {purchases.map((p: any, i) => (
                    <tr key={i} className="border-t border-border/40 hover:bg-card2/50">
                      <td className="px-4 py-1.5 text-text">{p.item_name}</td>
                      <td className="px-4 py-1.5 tabular-nums">{p.qty}</td>
                      <td className="px-4 py-1.5 text-subtext tabular-nums">{p.request_date ?? "—"}</td>
                      <td className={cn("px-4 py-1.5 tabular-nums",
                        p.supply_date && p.supply_date < todayStr && p.status === "مفتوح" ? "text-danger font-semibold" : "text-subtext")}>
                        {p.supply_date ?? "—"}
                      </td>
                      <td className="px-4 py-1.5"><Badge label={p.status} /></td>
                      <td className="px-4 py-1.5">
                        {p.image_path
                          ? <a href={getImageUrl(p.image_path)} target="_blank" rel="noopener" className="text-accent hover:underline">عرض</a>
                          : <span className="text-subtext">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="eg-card"><EmptyState message="لا توجد طلبات شراء" /></div>
        )}

        {/* ═══ قائمة الإنتاج ═══ */}
        {tab === "prodlist" && (
          <div className="space-y-3">
            {prodItems.length > 0 && (
              <div className="eg-card !p-0 overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[900px]">
                  <thead><tr className="bg-card2 text-subtext">
                    <th className="px-3 py-2 text-center font-semibold w-14">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold">Description</th>
                    <th className="px-3 py-2 text-right font-semibold w-24">Part No.</th>
                    <th className="px-3 py-2 text-right font-semibold w-24">Steel</th>
                    <th className="px-3 py-2 text-right font-semibold w-20">Thk.</th>
                    {PROD_STAGES.map(s => <th key={s.key} className="px-3 py-2 text-center font-semibold w-32">{s.label}</th>)}
                    {canManageLists && <th className="w-16" />}
                  </tr></thead>
                  <tbody>
                    {prodItems.map((it: any) => {
                      const needsPaint = it.required_painting !== "NA";
                      return (
                        <tr key={it.id} className="border-t border-border/40 hover:bg-card2/50">
                          <td className="px-3 py-1.5 text-center tabular-nums">{it.qty}</td>
                          <td className="px-3 py-1.5 text-text">{it.description}</td>
                          <td className="px-3 py-1.5 font-mono text-accent">{it.part_no ?? "—"}</td>
                          <td className="px-3 py-1.5">{it.sheet_steel ?? "—"}</td>
                          <td className="px-3 py-1.5">{it.thickness ?? "—"}</td>
                          {PROD_STAGES.map(s => {
                            if (s.key === "paint" && !needsPaint) {
                              return <td key={s.key} className="px-3 py-1.5 text-center text-subtext">NA</td>;
                            }
                            const produced = it[s.col] ?? 0;
                            const remaining = (it.qty ?? 0) - produced;
                            let prevKey: StageKey | null = null;
                            if (s.key === "paint") prevKey = "sheet";
                            if (s.key === "assembly") prevKey = needsPaint ? "paint" : "sheet";
                            const prevCol = prevKey ? `qty_${prevKey}` : null;
                            const available = prevCol ? (it[prevCol] ?? 0) - produced : Infinity;
                            const canLog = remaining > 0 && available > 0;
                            const prevLabel = PROD_STAGES.find(x => x.key === prevKey)?.label;
                            return (
                              <td key={s.key} className="px-3 py-1.5">
                                <div className="flex items-center justify-center gap-2">
                                  <span className={cn("tabular-nums", remaining <= 0 ? "text-success font-semibold" : "text-text")}>
                                    {fmt(produced)}/{fmt(it.qty)}
                                  </span>
                                  <button onClick={() => openLogStage(it, s.key)} disabled={!canLog}
                                    className="text-accent disabled:text-subtext disabled:cursor-not-allowed hover:underline">
                                    تسجيل
                                  </button>
                                </div>
                                {!canLog && remaining > 0 && prevLabel && (
                                  <p className="text-[10px] text-warning text-center mt-0.5">بانتظار {prevLabel}</p>
                                )}
                              </td>
                            );
                          })}
                          {canManageLists && (
                            <td className="px-3 py-1.5">
                              <div className="flex items-center gap-2">
                                <button onClick={() => openEditProdItem(it)} className="text-subtext hover:text-accent" title="تعديل">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => removeProdItem(it.id)} className="text-subtext hover:text-danger" title="حذف">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {prodItems.length === 0 && <div className="eg-card"><EmptyState message="لا توجد بنود إنتاج بعد" /></div>}

            {canManageLists && (
              <div className="eg-card !p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-text">إضافة بنود</p>
                  <p className="text-[11px] text-subtext">الصق من Excel في أي خانة (Qty, Description, Part No., Steel, Thickness)</p>
                </div>
                <GridEditor
                  cols={[
                    { key: "qty", label: "Qty", w: "w-16" },
                    { key: "description", label: "Description", w: "" },
                    { key: "part_no", label: "Part No.", w: "w-28" },
                    { key: "sheet_steel", label: "Steel", w: "w-28" },
                    { key: "thickness", label: "Thk.", w: "w-24" },
                  ]}
                  rows={draftRows as any[]}
                  onChange={(idx, patch) => updateProdDraft(idx, patch as Partial<ProdDraft>)}
                  onPaste={handleProdPaste}
                  onRemove={removeProdDraft}
                  extra={(row, idx) => (
                    <select value={row.required_painting}
                      onChange={e => updateProdDraft(idx, { required_painting: e.target.value as "YES" | "NA" })}
                      className="eg-select !py-1 !text-xs">
                      <option value="YES">يدخل دهان</option>
                      <option value="NA">بدون دهان</option>
                    </select>
                  )}
                  extraHead="الدهان"
                />
                <div className="flex gap-2">
                  <button onClick={() => setDraftRows(p => [...p, emptyProdDraft()])} className="eg-btn-ghost !py-1 !text-xs">
                    <Plus className="w-3 h-3" />صف
                  </button>
                  <button onClick={saveProdList} disabled={savingProdList} className="eg-btn-primary !py-1 !text-xs">
                    <Save className="w-3 h-3" />{savingProdList ? "جاري الحفظ..." : "حفظ البنود"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ BOM ═══ */}
        {tab === "bom" && (
          <div className="space-y-3">
            <p className="text-[11px] text-subtext">
              {bomDeptEffective
                ? <>بنود الـ BOM لقسم <span className="text-text">{deptLabel(bomDeptEffective)}</span>.</>
                : <span className="text-warning">اختار القسم اللي البنود دي بتاعته قبل الحفظ.</span>}
            </p>

            {bomItems.length > 0 && (
              <div className="eg-card !p-0 overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[860px]">
                  <thead><tr className="bg-card2 text-subtext">
                    <th className="px-3 py-2 text-center font-semibold w-14">S.NO</th>
                    <th className="px-3 py-2 text-center font-semibold w-16">Qty</th>
                    <th className="px-3 py-2 text-center font-semibold w-16">Unit</th>
                    <th className="px-3 py-2 text-right font-semibold">Description</th>
                    <th className="px-3 py-2 text-right font-semibold w-24">Part No.</th>
                    <th className="px-3 py-2 text-right font-semibold w-28">Remark</th>
                    <th className="px-3 py-2 text-center font-semibold w-20">القسم</th>
                    <th className="px-3 py-2 text-center font-semibold w-20">المنصرف</th>
                    <th className="px-3 py-2 text-center font-semibold w-20">المتبقي</th>
                    <th className="px-3 py-2 text-center font-semibold w-36">إجراءات</th>
                  </tr></thead>
                  <tbody>
                    {bomItems.map((it: any) => {
                      const remaining = (it.qty ?? 0) - (it.qty_dispensed ?? 0);
                      return (
                        <tr key={it.id} className="border-t border-border/40 hover:bg-card2/50">
                          <td className="px-3 py-1.5 text-center">{it.s_no ?? "—"}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums">{it.qty}</td>
                          <td className="px-3 py-1.5 text-center">{it.unit ?? "—"}</td>
                          <td className="px-3 py-1.5 text-text">{it.description}</td>
                          <td className="px-3 py-1.5 font-mono text-accent">{it.part_no ?? "—"}</td>
                          <td className="px-3 py-1.5 text-subtext">{it.remark ?? "—"}</td>
                          <td className="px-3 py-1.5 text-center"><Badge label={it.department} /></td>
                          <td className="px-3 py-1.5 text-center tabular-nums font-medium">{it.qty_dispensed ?? 0}</td>
                          <td className={cn("px-3 py-1.5 text-center tabular-nums font-semibold", remaining <= 0 ? "text-success" : "text-warning")}>{remaining}</td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => { setDispenseItem(it); setDispenseQty(""); }} disabled={remaining <= 0}
                                className="text-success disabled:text-subtext disabled:cursor-not-allowed hover:underline">صرف</button>
                              {canManageLists && (
                                <>
                                  <button onClick={() => openEditBomItem(it)} className="text-subtext hover:text-accent" title="تعديل">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button onClick={() => removeBomItem(it.id)} className="text-subtext hover:text-danger" title="حذف">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {bomItems.length === 0 && <div className="eg-card"><EmptyState message="لا توجد بنود BOM لقسمك على هذا الأمر" /></div>}

            {canManageLists && (
              <div className="eg-card !p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-text">إضافة بنود BOM</p>
                  <p className="text-[11px] text-subtext">الصق من Excel (S.NO, Qty, Unit, Description, Part No., Remark) — القسم تلقائي</p>
                </div>
                <GridEditor
                  cols={[
                    { key: "s_no", label: "S.NO", w: "w-16" },
                    { key: "qty", label: "Qty", w: "w-16" },
                    { key: "unit", label: "Unit", w: "w-16" },
                    { key: "description", label: "Description", w: "" },
                    { key: "part_no", label: "Part No.", w: "w-28" },
                    { key: "remark", label: "Remark", w: "w-32" },
                  ]}
                  rows={bomDraftRows as any[]}
                  onChange={(idx, patch) => updateBomDraft(idx, patch as Partial<BomDraft>)}
                  onPaste={handleBomPaste}
                  onRemove={removeBomDraft}
                />
                <div className="flex gap-2">
                  <button onClick={() => setBomDraftRows(p => [...p, emptyBomDraft()])} className="eg-btn-ghost !py-1 !text-xs">
                    <Plus className="w-3 h-3" />صف
                  </button>
                  {role === "manager" && (
                    <select value={bomDept} onChange={e => setBomDept(e.target.value)} className="eg-select !py-1 !text-xs w-36">
                      <option value="">— اختار القسم —</option>
                      {["SHEET", "PAINT", "ASSEMBLY"].map(d => <option key={d} value={d}>{deptLabel(d)}</option>)}
                    </select>
                  )}
                  <button onClick={saveBomList} disabled={savingBomList || !bomDeptEffective} className="eg-btn-primary !py-1 !text-xs">
                    <Save className="w-3 h-3" />{savingBomList ? "جاري الحفظ..." : "حفظ البنود"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ مودال تعديل صف الإنتاج ═══ */}
      <Modal open={!!editProdItem} onClose={() => setEditProdItem(null)} title="تعديل صف قائمة الإنتاج">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty"><input type="number" min="0.01" step="any" value={editProdForm.qty}
              onChange={e => setEditProdForm(f => ({ ...f, qty: e.target.value }))} className="eg-input" /></Field>
            <Field label="Part No."><input value={editProdForm.part_no}
              onChange={e => setEditProdForm(f => ({ ...f, part_no: e.target.value }))} className="eg-input" /></Field>
          </div>
          <Field label="Description"><input value={editProdForm.description}
            onChange={e => setEditProdForm(f => ({ ...f, description: e.target.value }))} className="eg-input" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Steel"><input value={editProdForm.sheet_steel}
              onChange={e => setEditProdForm(f => ({ ...f, sheet_steel: e.target.value }))} className="eg-input" /></Field>
            <Field label="Thickness"><input value={editProdForm.thickness}
              onChange={e => setEditProdForm(f => ({ ...f, thickness: e.target.value }))} className="eg-input" /></Field>
          </div>
          <Field label="الدهان">
            <select value={editProdForm.required_painting}
              onChange={e => setEditProdForm(f => ({ ...f, required_painting: e.target.value as "YES" | "NA" }))}
              className="eg-select">
              <option value="YES">يدخل دهان</option>
              <option value="NA">بدون دهان</option>
            </select>
          </Field>
          <button onClick={submitEditProdItem} className="eg-btn-success w-full justify-center mt-2">
            <Save className="w-4 h-4" />حفظ التعديل
          </button>
        </div>
      </Modal>

      {/* ═══ مودال تعديل BOM ═══ */}
      <Modal open={!!editBomItem} onClose={() => setEditBomItem(null)} title="تعديل بند BOM">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="S.NO"><input type="number" value={editBomForm.s_no}
              onChange={e => setEditBomForm(f => ({ ...f, s_no: e.target.value }))} className="eg-input" /></Field>
            <Field label="Qty"><input type="number" min="0.01" step="any" value={editBomForm.qty}
              onChange={e => setEditBomForm(f => ({ ...f, qty: e.target.value }))} className="eg-input" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit"><input value={editBomForm.unit}
              onChange={e => setEditBomForm(f => ({ ...f, unit: e.target.value }))} className="eg-input" /></Field>
            <Field label="Part No."><input value={editBomForm.part_no}
              onChange={e => setEditBomForm(f => ({ ...f, part_no: e.target.value }))} className="eg-input" /></Field>
          </div>
          <Field label="Description"><input value={editBomForm.description}
            onChange={e => setEditBomForm(f => ({ ...f, description: e.target.value }))} className="eg-input" /></Field>
          <Field label="Remark"><input value={editBomForm.remark}
            onChange={e => setEditBomForm(f => ({ ...f, remark: e.target.value }))} className="eg-input" /></Field>
          <button onClick={submitEditBomItem} className="eg-btn-success w-full justify-center mt-2">
            <Save className="w-4 h-4" />حفظ التعديل
          </button>
        </div>
      </Modal>

      {/* ═══ مودال صرف BOM ═══ */}
      <Modal open={!!dispenseItem} onClose={() => setDispenseItem(null)} title="صرف كمية" size="sm">
        {dispenseItem && (
          <div className="space-y-3">
            <div className="bg-card2 rounded-lg p-3">
              <p className="text-sm text-text font-medium">{dispenseItem.description}</p>
              <p className="text-[11px] text-subtext mt-1 tabular-nums">
                الإجمالي {dispenseItem.qty} · المنصرف {dispenseItem.qty_dispensed ?? 0} · المتبقي {(dispenseItem.qty ?? 0) - (dispenseItem.qty_dispensed ?? 0)}
              </p>
            </div>
            <Field label="الكمية المراد صرفها">
              <input type="number" min="0.01" step="any" value={dispenseQty} autoFocus
                onChange={e => setDispenseQty(e.target.value)} className="eg-input" />
            </Field>
            <button onClick={submitDispense} disabled={dispensing} className="eg-btn-success w-full justify-center">
              {dispensing ? "جاري الصرف..." : "تأكيد الصرف"}
            </button>
          </div>
        )}
      </Modal>

      {/* ═══ مودال تسجيل إنتاج ═══ */}
      <Modal open={!!logStage} onClose={() => setLogStage(null)} title="تسجيل إنتاج" size="sm">
        {logStage && (
          <div className="space-y-3">
            <div className="bg-card2 rounded-lg p-3">
              <p className="text-sm text-text font-medium">{logStage.item.description}</p>
              <p className="text-[11px] text-subtext mt-1 tabular-nums">
                المرحلة: {PROD_STAGES.find(s => s.key === logStage.stage)?.label} · المنجز {fmt(logStage.item[`qty_${logStage.stage}`] ?? 0)} / {fmt(logStage.item.qty)}
              </p>
            </div>
            <Field label="الكمية المنجزة">
              <input type="number" min="0.01" step="any" value={logQty} autoFocus
                onChange={e => setLogQty(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitLogStage()} className="eg-input" />
            </Field>
            <button onClick={submitLogStage} disabled={logging} className="eg-btn-success w-full justify-center">
              {logging ? "جاري التسجيل..." : "تأكيد التسجيل"}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ═══════════════════════ مكونات صغيرة ═══════════════════════ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-subtext mb-1">{label}</label>
      {children}
    </div>
  );
}

function DataTable({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (!rows.length) return <div className="eg-card"><EmptyState message={empty} /></div>;
  return (
    <div className="eg-card !p-0 overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[560px]">
        <thead><tr className="bg-card2 text-subtext">
          {head.map(h => <th key={h} className="px-4 py-2 text-right font-semibold">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/40 hover:bg-card2/50">
              {r.map((cell, j) => (
                <td key={j} className={cn("px-4 py-1.5", j === 0 ? "text-text" : "text-subtext")}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* محرر شبكي بيدعم اللصق من Excel */
function GridEditor({
  cols, rows, onChange, onPaste, onRemove, extra, extraHead,
}: {
  cols: { key: string; label: string; w: string }[];
  rows: any[];
  onChange: (idx: number, patch: Record<string, string>) => void;
  onPaste: (e: ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => void;
  onRemove: (idx: number) => void;
  extra?: (row: any, idx: number) => React.ReactNode;
  extraHead?: string;
}) {
  return (
    <div className="border border-border/60 rounded-lg overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[600px]">
        <thead><tr className="bg-card2 text-subtext">
          {cols.map(c => <th key={c.key} className={cn("px-2 py-1.5 text-right font-semibold", c.w)}>{c.label}</th>)}
          {extra && <th className="px-2 py-1.5 text-right font-semibold w-36">{extraHead}</th>}
          <th className="w-8" />
        </tr></thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="border-t border-border/40">
              {cols.map((c, cIdx) => (
                <td key={c.key} className="px-1 py-1">
                  <input value={row[c.key] ?? ""}
                    onChange={e => onChange(rIdx, { [c.key]: e.target.value })}
                    onPaste={e => onPaste(e, rIdx, cIdx)}
                    className="eg-input !py-1 !px-2 !text-xs" />
                </td>
              ))}
              {extra && <td className="px-1 py-1">{extra(row, rIdx)}</td>}
              <td className="px-1 py-1 text-center">
                <button onClick={() => onRemove(rIdx)} className="text-subtext hover:text-danger" title="حذف الصف">
                  <X className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
