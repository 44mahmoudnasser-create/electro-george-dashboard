"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { WorkOrder } from "@/types";
import { today } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Pencil, Trash2, Image as ImageIcon, ChevronDown } from "lucide-react";

// ---------------------------------------------------------------------
// أنواع البيانات: أمر شراء (Header) بداخله بنود (كل بند له فئة وكمية وحالة)
// ---------------------------------------------------------------------
const CATEGORIES = ["عدد", "كيلو", "جرام", "علبة"] as const;
type Category = typeof CATEGORIES[number];
const STATUSES = ["مفتوح", "تم التوريد", "ملغي"] as const;

interface PurchaseItem {
  id: number;
  purchase_order_id: number;
  item_name: string;
  category: Category;
  quantity: number;
  status: string;
  supply_date: string | null;
  image_path: string | null;
}

interface PurchaseOrder {
  id: number;
  wo_id: number | null;
  request_date: string;
  work_order?: { wo_number: string } | null;
  purchase_items: PurchaseItem[];
}

type ItemForm = {
  item_name: string;
  category: Category;
  quantity: string;
  supply_date: string;
  status: string;
  image: File | null;
};

const emptyItemForm = (): ItemForm => ({
  item_name: "", category: "عدد", quantity: "1", supply_date: "", status: "مفتوح", image: null,
});

export default function PurchasesClient({
  initialOrders, wos, role,
}: { initialOrders: PurchaseOrder[]; wos: Pick<WorkOrder, "id" | "wo_number">[]; role: string }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>(initialOrders);
  const todayStr = today();
  const isAdmin = role === "admin";

  // ---------- مودال: أمر شراء جديد (ببنوده) ----------
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [newOrderWoId, setNewOrderWoId] = useState("");
  const [newOrderItems, setNewOrderItems] = useState<ItemForm[]>([emptyItemForm()]);
  const [saving, setSaving] = useState(false);

  // ---------- مودال: إضافة بند لأمر شراء موجود ----------
  const [addItemOrderId, setAddItemOrderId] = useState<number | null>(null);
  const [addItemForm, setAddItemForm] = useState<ItemForm>(emptyItemForm());

  // ---------- مودال: تعديل بند ----------
  const [editItem, setEditItem] = useState<PurchaseItem | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(emptyItemForm());

  const uploadItemImage = async (file: File, itemId: number) => {
    const path = `purchases/${itemId}/${Date.now()}_${file.name}`;
    await supabase.storage.from("purchases").upload(path, file, { upsert: true });
    await supabase.from("purchase_items").update({ image_path: path }).eq("id", itemId);
    return path;
  };

  const getImageUrl = (path?: string | null) => {
    if (!path) return null;
    const { data } = supabase.storage.from("purchases").getPublicUrl(path);
    return data.publicUrl;
  };

  // ---------------------------------------------------------------------
  // إنشاء أمر شراء جديد مع كل بنوده دفعة واحدة
  // ---------------------------------------------------------------------
  const resetNewOrder = () => { setNewOrderWoId(""); setNewOrderItems([emptyItemForm()]); };

  const updateNewOrderItem = (idx: number, patch: Partial<ItemForm>) => {
    setNewOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const addNewOrderRow = () => setNewOrderItems(prev => [...prev, emptyItemForm()]);
  const removeNewOrderRow = (idx: number) => setNewOrderItems(prev => prev.filter((_, i) => i !== idx));

  const createOrder = async () => {
    const validItems = newOrderItems.filter(it => it.item_name.trim());
    if (validItems.length === 0) { alert("لازم بند واحد على الأقل بيه اسم صنف"); return; }
    setSaving(true);

    const { data: order, error: orderErr } = await supabase
      .from("purchase_orders")
      .insert({ wo_id: newOrderWoId ? parseInt(newOrderWoId) : null, request_date: todayStr })
      .select("*, work_order:work_orders(wo_number)")
      .single();
    if (orderErr) { alert(orderErr.message); setSaving(false); return; }

    const rowsToInsert = validItems.map(it => ({
      purchase_order_id: order.id,
      item_name: it.item_name,
      category: it.category,
      quantity: parseFloat(it.quantity) || 1,
      status: it.status,
      supply_date: it.supply_date || null,
    }));
    const { data: insertedItems, error: itemsErr } = await supabase
      .from("purchase_items").insert(rowsToInsert).select("*");
    if (itemsErr) { alert(itemsErr.message); setSaving(false); return; }

    // رفع الصور لو موجودة، بالترتيب نفسه
    for (let i = 0; i < validItems.length; i++) {
      const file = validItems[i].image;
      if (file) await uploadItemImage(file, insertedItems[i].id);
    }
    // بعد رفع الصور، جيب البنود تاني عشان image_path يكون محدث في الواجهة
    const { data: refreshedItems } = await supabase
      .from("purchase_items").select("*").eq("purchase_order_id", order.id);

    setOrders(prev => [{ ...order, purchase_items: (refreshedItems ?? insertedItems) as PurchaseItem[] }, ...prev]);
    setAddOrderOpen(false); resetNewOrder(); setSaving(false);
  };

  // ---------------------------------------------------------------------
  // إضافة بند لأمر شراء موجود
  // ---------------------------------------------------------------------
  const openAddItem = (orderId: number) => { setAddItemOrderId(orderId); setAddItemForm(emptyItemForm()); };

  const submitAddItem = async () => {
    if (addItemOrderId == null || !addItemForm.item_name.trim()) return;
    setSaving(true);
    const payload = {
      purchase_order_id: addItemOrderId,
      item_name: addItemForm.item_name,
      category: addItemForm.category,
      quantity: parseFloat(addItemForm.quantity) || 1,
      status: addItemForm.status,
      supply_date: addItemForm.supply_date || null,
    };
    const { data, error } = await supabase.from("purchase_items").insert(payload).select("*").single();
    if (error) { alert(error.message); setSaving(false); return; }
    if (addItemForm.image) await uploadItemImage(addItemForm.image, data.id);
    setOrders(prev => prev.map(o => o.id === addItemOrderId
      ? { ...o, purchase_items: [...o.purchase_items, data] } : o));
    setAddItemOrderId(null); setSaving(false);
  };

  // ---------------------------------------------------------------------
  // تعديل بند
  // ---------------------------------------------------------------------
  const openEditItem = (item: PurchaseItem) => {
    setEditItem(item);
    setEditForm({
      item_name: item.item_name, category: item.category, quantity: String(item.quantity),
      supply_date: item.supply_date ?? "", status: item.status, image: null,
    });
  };

  const submitEditItem = async () => {
    if (!editItem) return;
    setSaving(true);
    const payload = {
      item_name: editForm.item_name || editItem.item_name,
      category: editForm.category,
      quantity: parseFloat(editForm.quantity) || editItem.quantity,
      status: editForm.status,
      supply_date: editForm.supply_date || null,
    };
    const { error } = await supabase.from("purchase_items").update(payload).eq("id", editItem.id);
    if (error) { alert(error.message); setSaving(false); return; }
    if (editForm.image) await uploadItemImage(editForm.image, editItem.id);
    setOrders(prev => prev.map(o => ({
      ...o,
      purchase_items: o.purchase_items.map(it => it.id === editItem.id ? { ...it, ...payload } : it),
    })));
    setEditItem(null); setSaving(false);
  };

  // ---------------------------------------------------------------------
  // حذف بند / حذف أمر شراء كامل
  // ---------------------------------------------------------------------
  const removeItem = async (orderId: number, itemId: number) => {
    if (!confirm("حذف هذا البند؟")) return;
    await supabase.from("purchase_items").delete().eq("id", itemId);
    setOrders(prev => prev.map(o => o.id === orderId
      ? { ...o, purchase_items: o.purchase_items.filter(it => it.id !== itemId) } : o));
  };

  const removeOrder = async (orderId: number) => {
    if (!confirm("حذف أمر الشراء ده بكل بنوده؟")) return;
    await supabase.from("purchase_orders").delete().eq("id", orderId);
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  // ---------------------------------------------------------------------
  // عناصر النموذج القابلة لإعادة الاستخدام لأي بند (فئة + كمية + باقي الحقول)
  // ---------------------------------------------------------------------
  const ItemFields = ({ value, onChange }: { value: ItemForm; onChange: (patch: Partial<ItemForm>) => void }) => (
    <div className="space-y-4">
      <div><label className="eg-label">الصنف *</label>
        <input value={value.item_name} onChange={e => onChange({ item_name: e.target.value })} className="eg-input" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="eg-label">الكمية</label>
          <input type="number" min="0.01" step="any" value={value.quantity}
            onChange={e => onChange({ quantity: e.target.value })} className="eg-input" /></div>
        <div><label className="eg-label">الفئة</label>
          <select value={value.category} onChange={e => onChange({ category: e.target.value as Category })} className="eg-select">
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="eg-label">تاريخ التوريد المتوقع</label>
          <input type="date" value={value.supply_date} onChange={e => onChange({ supply_date: e.target.value })} className="eg-input" /></div>
        <div><label className="eg-label">الحالة</label>
          <select value={value.status} onChange={e => onChange({ status: e.target.value })} className="eg-select">
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select></div>
      </div>
      <div>
        <label className="eg-label">صورة إيصال / الصنف (اختياري)</label>
        <label className="eg-btn-ghost cursor-pointer text-sm inline-flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          {value.image ? value.image.name : "اختر صورة"}
          <input type="file" accept="image/*" className="hidden"
            onChange={e => onChange({ image: e.target.files?.[0] ?? null })} />
        </label>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text">🛒 طلبات الشراء</h1>
        <button onClick={() => setAddOrderOpen(true)} className="eg-btn-primary">
          <Plus className="w-4 h-4" />أمر شراء جديد
        </button>
      </div>

      <div className="space-y-4">
        {orders.map(order => (
          <details key={order.id} open className="eg-card overflow-hidden group">
            <summary className="flex items-center justify-between gap-3 p-3 cursor-pointer select-none list-none">
              <div className="flex items-center gap-3">
                <ChevronDown className="w-4 h-4 text-subtext transition-transform group-open:rotate-180" />
                <span className="font-mono text-accent">{order.work_order?.wo_number ?? "بدون أمر شغل"}</span>
                <span className="text-subtext text-xs">طلب بتاريخ {order.request_date}</span>
                <span className="text-subtext text-xs">· {order.purchase_items.length} بند</span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={(e) => { e.preventDefault(); openAddItem(order.id); }}
                  className="text-accent text-xs hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" />إضافة بند
                </button>
                {isAdmin && (
                  <button onClick={(e) => { e.preventDefault(); removeOrder(order.id); }}
                    className="text-danger/60 hover:text-danger transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </summary>

            <div className="overflow-x-auto border-t border-border">
              <table className="eg-table">
                <thead><tr>
                  <th>الصنف</th><th>الكمية</th><th>الفئة</th>
                  <th>تاريخ التوريد</th><th>الحالة</th><th>صورة</th>
                  {isAdmin && <th>إجراءات</th>}
                </tr></thead>
                <tbody>
                  {order.purchase_items.map(item => (
                    <tr key={item.id}>
                      <td className="font-medium text-text">{item.item_name}</td>
                      <td>{item.quantity}</td>
                      <td>{item.category}</td>
                      <td className={item.supply_date && item.supply_date < todayStr && item.status === "مفتوح" ? "text-danger font-medium" : "text-subtext"}>
                        {item.supply_date ?? "—"}
                      </td>
                      <td><Badge label={item.status} /></td>
                      <td>
                        {item.image_path ? (
                          <a href={getImageUrl(item.image_path) ?? "#"} target="_blank" rel="noopener"
                            className="text-accent text-xs hover:underline flex items-center gap-1">
                            <ImageIcon className="w-3 h-3" />عرض
                          </a>
                        ) : <span className="text-subtext text-xs">—</span>}
                      </td>
                      {isAdmin && (
                        <td>
                          <div className="flex gap-2">
                            <button onClick={() => openEditItem(item)} className="text-accent hover:text-accent2 transition-colors">
                              <Pencil className="w-4 h-4" /></button>
                            <button onClick={() => removeItem(order.id, item.id)} className="text-danger/60 hover:text-danger transition-colors">
                              <Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {order.purchase_items.length === 0 && (
                    <tr><td colSpan={isAdmin ? 7 : 6} className="text-center text-subtext text-sm py-3">لا توجد بنود بعد</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        {orders.length === 0 && <div className="eg-card"><EmptyState /></div>}
      </div>

      {/* أمر شراء جديد + بنوده */}
      <Modal open={addOrderOpen} onClose={() => { setAddOrderOpen(false); resetNewOrder(); }} title="أمر شراء جديد">
        <div className="space-y-5">
          <div><label className="eg-label">أمر الشغل</label>
            <select value={newOrderWoId} onChange={e => setNewOrderWoId(e.target.value)} className="eg-select">
              <option value="">— بدون أمر شغل —</option>
              {wos.map(w => <option key={w.id} value={w.id}>{w.wo_number}</option>)}
            </select></div>

          <div className="space-y-4">
            {newOrderItems.map((item, idx) => (
              <div key={idx} className="border border-border rounded-lg p-3 relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-subtext">بند {idx + 1}</span>
                  {newOrderItems.length > 1 && (
                    <button onClick={() => removeNewOrderRow(idx)} className="text-danger/60 hover:text-danger text-xs flex items-center gap-1">
                      <Trash2 className="w-3 h-3" />حذف البند
                    </button>
                  )}
                </div>
                <ItemFields value={item} onChange={patch => updateNewOrderItem(idx, patch)} />
              </div>
            ))}
          </div>

          <button onClick={addNewOrderRow} className="eg-btn-ghost text-sm w-full justify-center">
            <Plus className="w-4 h-4" />إضافة بند تاني
          </button>

          <button onClick={createOrder} disabled={saving} className="eg-btn-primary w-full justify-center">
            {saving ? "جاري الحفظ..." : "💾 حفظ أمر الشراء"}
          </button>
        </div>
      </Modal>

      {/* إضافة بند لأمر شراء موجود */}
      <Modal open={addItemOrderId !== null} onClose={() => setAddItemOrderId(null)} title="إضافة بند">
        <ItemFields value={addItemForm} onChange={patch => setAddItemForm(f => ({ ...f, ...patch }))} />
        <button onClick={submitAddItem} disabled={saving} className="eg-btn-primary w-full justify-center mt-5">
          {saving ? "جاري الحفظ..." : "💾 حفظ البند"}
        </button>
      </Modal>

      {/* تعديل بند */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="تعديل البند">
        <ItemFields value={editForm} onChange={patch => setEditForm(f => ({ ...f, ...patch }))} />
        <button onClick={submitEditItem} disabled={saving} className="eg-btn-success w-full justify-center mt-5">
          {saving ? "جاري الحفظ..." : "💾 حفظ التعديل"}
        </button>
      </Modal>
    </div>
  );
}
