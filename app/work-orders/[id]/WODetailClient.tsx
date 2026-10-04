"use client";
import { useState } from "react";
import type { ClipboardEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { ChevronRight, Save } from "lucide-react";
import { today } from "@/lib/utils";

const STATUSES = ["لم يبدأ","جاري","متوقف","مكتمل","تم التسليم"];
const PRIORITIES = ["منخفضة","متوسطة","عالية","عاجلة"];

export default function WODetailClient({
  wo, productivity, files, purchases, products, initialWoProducts, initialProdItems, initialBomItems, role, department,
}: {
  wo: any; productivity: any[]; files: any[]; purchases: any[];
  products: { id:number; name:string }[]; initialWoProducts: any[]; initialProdItems: any[];
  initialBomItems: any[]; role: string; department: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(wo.status);
  const [delivery, setDelivery] = useState(wo.expected_delivery ?? "");
  const [priority, setPriority] = useState(wo.priority ?? "متوسطة");
  const [planMonth, setPlanMonth] = useState(wo.plan_month ?? "");
  const [checks, setChecks] = useState({
    chk_client: !!wo.chk_client,
    chk_quality: !!wo.chk_quality,
    chk_assembly: !!wo.chk_assembly,
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"prod"|"files"|"purchases"|"products"|"prodlist"|"bom">("prod");
  const todayStr = today();
  const canManage = role === "admin" || role === "manager";

  // ---------- المنتجات القياسية المربوطة بالأوردر ----------
  const [woProducts, setWoProducts] = useState(initialWoProducts);
  const [addProductId, setAddProductId] = useState("");
  const [addProductQty, setAddProductQty] = useState("1");
  const [savingProduct, setSavingProduct] = useState(false);

  const addProduct = async () => {
    if (!addProductId) return;
    setSavingProduct(true);
    const { data, error } = await supabase.from("work_order_products")
      .insert({ work_order_id: wo.id, standard_product_id: parseInt(addProductId), quantity: parseFloat(addProductQty) || 1 })
      .select("id, quantity, standard_product:standard_products(id,name)")
      .single();
    setSavingProduct(false);
    if (error) { alert(error.message); return; }
    setWoProducts(prev => [...prev, data]);
    setAddProductId(""); setAddProductQty("1");
  };

  const removeProduct = async (linkId: number) => {
    if (!confirm("حذف هذا المنتج من الأوردر؟")) return;
    await supabase.from("work_order_products").delete().eq("id", linkId);
    setWoProducts(prev => prev.filter((p:any) => p.id !== linkId));
  };

  // ---------- قائمة إنتاج الأمر (Qty / Description / Part No. / Sheet Steel / Thickness) ----------
  const PROD_COLS = ["qty","description","part_no","sheet_steel","thickness"] as const;
  type DraftRow = { qty:string; description:string; part_no:string; sheet_steel:string; thickness:string };
  const emptyDraftRow = (): DraftRow => ({ qty:"1", description:"", part_no:"", sheet_steel:"", thickness:"" });
  const [prodItems, setProdItems] = useState(initialProdItems);
  const [draftRows, setDraftRows] = useState<DraftRow[]>([emptyDraftRow()]);
  const [savingProdList, setSavingProdList] = useState(false);
  const [editProdItem, setEditProdItem] = useState<any>(null);
  const [editProdForm, setEditProdForm] = useState<DraftRow>(emptyDraftRow());

  const PROD_CHECKS = [
    { key: "chk_sheet",    label: "الصاج" },
    { key: "chk_paint",    label: "الدهان" },
    { key: "chk_assembly", label: "التجميع" },
  ] as const;

  const toggleProdCheck = async (itemId: number, key: string, value: boolean) => {
    setProdItems(prev => prev.map((it:any) => it.id === itemId ? { ...it, [key]: value } : it));
    const { error } = await supabase.from("wo_production_items").update({ [key]: value }).eq("id", itemId);
    if (error) {
      alert(error.message);
      setProdItems(prev => prev.map((it:any) => it.id === itemId ? { ...it, [key]: !value } : it));
    }
  };

  const handleGridPaste = (e: ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l, i, arr) => !(i === arr.length - 1 && l === ""));
    setDraftRows(prev => {
      const updated = [...prev];
      lines.forEach((line, i) => {
        const cells = line.split("\t");
        const targetIdx = rowIdx + i;
        while (updated.length <= targetIdx) updated.push(emptyDraftRow());
        const row = { ...updated[targetIdx] };
        cells.forEach((val, j) => {
          const col = PROD_COLS[colIdx + j];
          if (col) (row as any)[col] = val.trim();
        });
        updated[targetIdx] = row;
      });
      return updated;
    });
  };

  const updateDraftRow = (idx: number, patch: Partial<DraftRow>) =>
    setDraftRows(prev => prev.map((r,i) => i === idx ? { ...r, ...patch } : r));
  const addDraftRow = () => setDraftRows(prev => [...prev, emptyDraftRow()]);
  const removeDraftRow = (idx: number) => setDraftRows(prev => prev.length > 1 ? prev.filter((_,i) => i !== idx) : [emptyDraftRow()]);

  const saveProdList = async () => {
    const rowsToInsert = draftRows
      .filter(r => r.description.trim())
      .map(r => ({
        work_order_id: wo.id,
        qty: parseFloat(r.qty) || 1,
        description: r.description.trim(),
        part_no: r.part_no.trim() || null,
        sheet_steel: r.sheet_steel.trim() || null,
        thickness: r.thickness.trim() || null,
      }));
    if (rowsToInsert.length === 0) return;
    setSavingProdList(true);
    const { data, error } = await supabase.from("wo_production_items").insert(rowsToInsert).select("*");
    setSavingProdList(false);
    if (error) { alert(error.message); return; }
    setProdItems(prev => [...prev, ...(data ?? [])]);
    setDraftRows([emptyDraftRow()]);
  };

  const openEditProdItem = (item: any) => {
    setEditProdItem(item);
    setEditProdForm({
      qty: String(item.qty), description: item.description,
      part_no: item.part_no ?? "", sheet_steel: item.sheet_steel ?? "", thickness: item.thickness ?? "",
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
    };
    const { error } = await supabase.from("wo_production_items").update(payload).eq("id", editProdItem.id);
    if (error) { alert(error.message); return; }
    setProdItems(prev => prev.map((it:any) => it.id === editProdItem.id ? { ...it, ...payload } : it));
    setEditProdItem(null);
  };

  const removeProdItem = async (itemId: number) => {
    if (!confirm("حذف هذا الصف من قائمة الإنتاج؟")) return;
    await supabase.from("wo_production_items").delete().eq("id", itemId);
    setProdItems(prev => prev.filter((it:any) => it.id !== itemId));
  };

  // ---------- BOM List (S.NO / Qty / Unit / Description / Drawing No. / Material Qty+Desc / Rev / Remark) ----------
  const BOM_COLS = ["s_no","qty","unit","description","drawing_no","material_qty","material_description","rev","remark"] as const;
  type BomDraftRow = {
    s_no:string; qty:string; unit:string; description:string; drawing_no:string;
    material_qty:string; material_description:string; rev:string; remark:string;
  };
  const emptyBomDraftRow = (): BomDraftRow => ({
    s_no:"", qty:"1", unit:"", description:"", drawing_no:"",
    material_qty:"", material_description:"", rev:"", remark:"",
  });
  const [bomItems, setBomItems] = useState(initialBomItems);
  const [bomDraftRows, setBomDraftRows] = useState<BomDraftRow[]>([emptyBomDraftRow()]);
  const [savingBomList, setSavingBomList] = useState(false);
  const [editBomItem, setEditBomItem] = useState<any>(null);
  const [editBomForm, setEditBomForm] = useState<BomDraftRow>(emptyBomDraftRow());
  const [dispenseItem, setDispenseItem] = useState<any>(null);
  const [dispenseQty, setDispenseQty] = useState("");
  const [dispensing, setDispensing] = useState(false);

  const handleBomGridPaste = (e: ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l, i, arr) => !(i === arr.length - 1 && l === ""));
    setBomDraftRows(prev => {
      const updated = [...prev];
      lines.forEach((line, i) => {
        const cells = line.split("\t");
        const targetIdx = rowIdx + i;
        while (updated.length <= targetIdx) updated.push(emptyBomDraftRow());
        const row = { ...updated[targetIdx] };
        cells.forEach((val, j) => {
          const col = BOM_COLS[colIdx + j];
          if (col) (row as any)[col] = val.trim();
        });
        updated[targetIdx] = row;
      });
      return updated;
    });
  };

  const updateBomDraftRow = (idx: number, patch: Partial<BomDraftRow>) =>
    setBomDraftRows(prev => prev.map((r,i) => i === idx ? { ...r, ...patch } : r));
  const addBomDraftRow = () => setBomDraftRows(prev => [...prev, emptyBomDraftRow()]);
  const removeBomDraftRow = (idx: number) => setBomDraftRows(prev => prev.length > 1 ? prev.filter((_,i) => i !== idx) : [emptyBomDraftRow()]);

  const saveBomList = async () => {
    const rowsToInsert = bomDraftRows
      .filter(r => r.description.trim())
      .map(r => ({
        work_order_id: wo.id,
        s_no: r.s_no.trim() ? parseInt(r.s_no) : null,
        qty: parseFloat(r.qty) || 1,
        unit: r.unit.trim() || null,
        description: r.description.trim(),
        drawing_no: r.drawing_no.trim() || null,
        material_qty: r.material_qty.trim() ? parseFloat(r.material_qty) : null,
        material_description: r.material_description.trim() || null,
        rev: r.rev.trim() || null,
        remark: r.remark.trim() || null,
        // department متحطة تلقائي من الـ trigger حسب قسم اليوزر
      }));
    if (rowsToInsert.length === 0) return;
    setSavingBomList(true);
    const { data, error } = await supabase.from("wo_bom_items").insert(rowsToInsert).select("*");
    setSavingBomList(false);
    if (error) { alert(error.message); return; }
    setBomItems(prev => [...prev, ...(data ?? [])]);
    setBomDraftRows([emptyBomDraftRow()]);
  };

  const openEditBomItem = (item: any) => {
    setEditBomItem(item);
    setEditBomForm({
      s_no: item.s_no != null ? String(item.s_no) : "",
      qty: String(item.qty),
      unit: item.unit ?? "",
      description: item.description,
      drawing_no: item.drawing_no ?? "",
      material_qty: item.material_qty != null ? String(item.material_qty) : "",
      material_description: item.material_description ?? "",
      rev: item.rev ?? "",
      remark: item.remark ?? "",
    });
  };

  const submitEditBomItem = async () => {
    if (!editBomItem) return;
    const payload = {
      s_no: editBomForm.s_no.trim() ? parseInt(editBomForm.s_no) : null,
      qty: parseFloat(editBomForm.qty) || 1,
      unit: editBomForm.unit.trim() || null,
      description: editBomForm.description.trim(),
      drawing_no: editBomForm.drawing_no.trim() || null,
      material_qty: editBomForm.material_qty.trim() ? parseFloat(editBomForm.material_qty) : null,
      material_description: editBomForm.material_description.trim() || null,
      rev: editBomForm.rev.trim() || null,
      remark: editBomForm.remark.trim() || null,
    };
    const { error } = await supabase.from("wo_bom_items").update(payload).eq("id", editBomItem.id);
    if (error) { alert(error.message); return; }
    setBomItems(prev => prev.map((it:any) => it.id === editBomItem.id ? { ...it, ...payload } : it));
    setEditBomItem(null);
  };

  const removeBomItem = async (itemId: number) => {
    if (!confirm("حذف هذا البند من الـ BOM؟")) return;
    await supabase.from("wo_bom_items").delete().eq("id", itemId);
    setBomItems(prev => prev.filter((it:any) => it.id !== itemId));
  };

  const openDispense = (item: any) => {
    setDispenseItem(item);
    setDispenseQty("");
  };

  const submitDispense = async () => {
    if (!dispenseItem) return;
    const q = parseFloat(dispenseQty);
    if (!q || q <= 0) { alert("أدخل كمية صحيحة"); return; }
    setDispensing(true);
    const { error } = await supabase.rpc("dispense_bom_item", {
      p_bom_item_id: dispenseItem.id,
      p_qty: q,
      p_note: null,
    });
    setDispensing(false);
    if (error) { alert(error.message); return; }
    setBomItems(prev => prev.map((it:any) =>
      it.id === dispenseItem.id ? { ...it, qty_dispensed: (it.qty_dispensed ?? 0) + q } : it
    ));
    setDispenseItem(null);
  };

  const save = async () => {
    setSaving(true);
    const patch: any = { status, expected_delivery: delivery || null, priority, plan_month: planMonth || null, ...checks };
    if (status === "مكتمل" && !wo.completion_date) patch.completion_date = todayStr;
    await supabase.from("work_orders").update(patch).eq("id", wo.id);
    setSaving(false);
    router.refresh();
  };

  const getImageUrl = (path: string) => {
    const { data } = supabase.storage.from("purchases").getPublicUrl(path);
    return data.publicUrl;
  };

  const CHECKLIST = [
    { key: "chk_client",   label: "استلمه العميل" },
    { key: "chk_quality",  label: "استلمه قسم الجودة" },
    { key: "chk_assembly", label: "تم الانتهاء من التجميع الكهربي" },
  ] as const;

  const TABS = [
    { key: "prod",      label: `الإنتاجية (${productivity.length})` },
    { key: "files",     label: `الملفات (${files.length})` },
    { key: "purchases", label: `المشتريات (${purchases.length})` },
    { key: "products",  label: `المنتجات (${woProducts.length})` },
    { key: "prodlist",  label: `قائمة الإنتاج (${prodItems.length})` },
    { key: "bom",       label: `BOM (${bomItems.length})` },
  ] as const;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.back()} className="eg-btn-ghost text-sm px-3 py-2">
          <ChevronRight className="w-4 h-4" /> أوامر الشغل
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-text font-mono">{wo.wo_number}</h1>
          <p className="text-sm text-subtext">أُنشئ: {wo.created_date ?? "—"}</p>
        </div>
        <Badge label={wo.status} />
        <span className="text-xs px-2 py-1 rounded-full bg-card2 text-text font-medium">⏫ {priority}</span>
      </div>

      {/* Edit card (admin only) */}
      {true && (
        <div className="eg-card space-y-4">
          <h2 className="font-semibold text-text">✏️ تعديل</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="eg-label">الحالة</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="eg-select">
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="eg-label">التسليم المتوقع</label>
              <input type="date" value={delivery} onChange={e => setDelivery(e.target.value)} className="eg-input" />
            </div>
            <div>
              <label className="eg-label">الأولوية</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="eg-select">
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="eg-label">شهر الخطة</label>
