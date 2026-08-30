"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Purchase, WorkOrder } from "@/types";
import { today } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Pencil, Trash2, Image as ImageIcon } from "lucide-react";

type PurchaseWithWO = Purchase & { work_order?: { wo_number: string } };

export default function PurchasesClient({
  initialPurchases, wos, role
}: { initialPurchases: PurchaseWithWO[]; wos: Pick<WorkOrder,"id"|"wo_number">[]; role: string }) {
  const [purchases, setPurchases] = useState<PurchaseWithWO[]>(initialPurchases);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<PurchaseWithWO|null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    wo_id: "", item_name: "", qty: "1", supply_date: "", status: "مفتوح", image: null as File|null,
  });
  const todayStr = today();

  const resetForm = () => setForm({ wo_id:"", item_name:"", qty:"1", supply_date:"", status:"مفتوح", image:null });

  const uploadImage = async (file: File, purchaseId: number) => {
    const path = `purchases/${purchaseId}/${Date.now()}_${file.name}`;
    await supabase.storage.from("purchases").upload(path, file, { upsert: true });
    await supabase.from("purchases").update({ image_path: path }).eq("id", purchaseId);
    return path;
  };

  const add = async () => {
    if (!form.item_name.trim()) return;
    setSaving(true);
    const payload = {
      wo_id: form.wo_id ? parseInt(form.wo_id) : null,
      item_name: form.item_name, qty: parseInt(form.qty),
      request_date: todayStr, supply_date: form.supply_date || null,
      status: form.status,
    };
    const { data, error } = await supabase.from("purchases").insert(payload).select("*, work_order:work_orders(wo_number)").single();
    if (error) { alert(error.message); setSaving(false); return; }
    if (form.image) await uploadImage(form.image, data.id);
    setPurchases(prev => [data, ...prev]);
    setAddOpen(false); resetForm(); setSaving(false);
  };

  const update = async () => {
    if (!editItem) return;
    setSaving(true);
    const payload = {
      wo_id: form.wo_id ? parseInt(form.wo_id) : editItem.wo_id,
      item_name: form.item_name || editItem.item_name,
      qty: parseInt(form.qty) || editItem.qty,
      supply_date: form.supply_date || editItem.supply_date,
      status: form.status,
    };
    const { error } = await supabase.from("purchases").update(payload).eq("id", editItem.id);
    if (error) { alert(error.message); setSaving(false); return; }
    if (form.image) await uploadImage(form.image, editItem.id);
    setPurchases(prev => prev.map(p => p.id === editItem.id ? { ...p, ...payload } : p));
    setEditItem(null); resetForm(); setSaving(false);
  };

  const remove = async (id: number) => {
    if (!confirm("حذف هذا الطلب؟")) return;
    await supabase.from("purchases").delete().eq("id", id);
    setPurchases(prev => prev.filter(p => p.id !== id));
  };

  const openEdit = (p: PurchaseWithWO) => {
    setEditItem(p);
    setForm({ wo_id: String(p.wo_id ?? ""), item_name: p.item_name, qty: String(p.qty),
      supply_date: p.supply_date ?? "", status: p.status, image: null });
  };

  const getImageUrl = (path?: string) => {
    if (!path) return null;
    const { data } = supabase.storage.from("purchases").getPublicUrl(path);
    return data.publicUrl;
  };

  const FormFields = () => (
    <div className="space-y-4">
      <div><label className="eg-label">أمر الشغل</label>
        <select value={form.wo_id} onChange={e=>setForm(f=>({...f,wo_id:e.target.value}))} className="eg-select">
          <option value="">— بدون أمر شغل —</option>
          {wos.map(w=><option key={w.id} value={w.id}>{w.wo_number}</option>)}
        </select></div>
      <div><label className="eg-label">الصنف *</label>
        <input value={form.item_name} onChange={e=>setForm(f=>({...f,item_name:e.target.value}))} className="eg-input" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="eg-label">الكمية</label>
          <input type="number" min="1" value={form.qty} onChange={e=>setForm(f=>({...f,qty:e.target.value}))} className="eg-input" /></div>
        <div><label className="eg-label">تاريخ التوريد المتوقع</label>
          <input type="date" value={form.supply_date} onChange={e=>setForm(f=>({...f,supply_date:e.target.value}))} className="eg-input" /></div>
      </div>
      <div><label className="eg-label">الحالة</label>
        <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="eg-select">
          {["مفتوح","تم التوريد","ملغي"].map(s=><option key={s}>{s}</option>)}
        </select></div>
      <div>
        <label className="eg-label">صورة إيصال / الصنف (اختياري)</label>
        <div className="flex items-center gap-2">
          <label className="eg-btn-ghost cursor-pointer text-sm">
            <ImageIcon className="w-4 h-4" />
            {form.image ? form.image.name : "اختر صورة"}
            <input type="file" accept="image/*" className="hidden"
              onChange={e=>setForm(f=>({...f,image:e.target.files?.[0]??null}))} />
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text">🛒 طلبات الشراء</h1>
        {true && (
          <button onClick={() => setAddOpen(true)} className="eg-btn-primary">
            <Plus className="w-4 h-4" />طلب شراء جديد
          </button>
        )}
      </div>

      <div className="eg-card overflow-x-auto">
        <table className="eg-table">
          <thead><tr>
            <th>الصنف</th><th>أمر الشغل</th><th>الكمية</th>
            <th>تاريخ الطلب</th><th>التوريد</th><th>الحالة</th><th>صورة</th>
            {role==="admin" && <th>إجراءات</th>}
          </tr></thead>
          <tbody>
            {purchases.map(p => (
              <tr key={p.id}>
                <td className="font-medium text-text">{p.item_name}</td>
                <td className="font-mono text-accent">{p.work_order?.wo_number ?? "—"}</td>
                <td>{p.qty}</td>
                <td className="text-subtext">{p.request_date ?? "—"}</td>
                <td className={p.supply_date && p.supply_date < todayStr && p.status==="مفتوح" ? "text-danger font-medium" : "text-subtext"}>
                  {p.supply_date ?? "—"}
                </td>
                <td><Badge label={p.status} /></td>
                <td>
                  {p.image_path ? (
                    <a href={getImageUrl(p.image_path) ?? "#"} target="_blank" rel="noopener"
                      className="text-accent text-xs hover:underline flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />عرض
                    </a>
                  ) : <span className="text-subtext text-xs">—</span>}
                </td>
                {role==="admin" && (
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="text-accent hover:text-accent2 transition-colors">
                        <Pencil className="w-4 h-4" /></button>
                      <button onClick={() => remove(p.id)} className="text-danger/60 hover:text-danger transition-colors">
                        <Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {purchases.length === 0 && <EmptyState />}
      </div>

      <Modal open={addOpen} onClose={() => { setAddOpen(false); resetForm(); }} title="طلب شراء جديد">
        <FormFields />
        <button onClick={add} disabled={saving} className="eg-btn-primary w-full justify-center mt-5">
          {saving ? "جاري الحفظ..." : "💾 حفظ"}
        </button>
      </Modal>

      <Modal open={!!editItem} onClose={() => { setEditItem(null); resetForm(); }} title="تعديل طلب الشراء">
        <FormFields />
        <button onClick={update} disabled={saving} className="eg-btn-success w-full justify-center mt-5">
          {saving ? "جاري الحفظ..." : "💾 حفظ التعديل"}
        </button>
      </Modal>
    </div>
  );
}
