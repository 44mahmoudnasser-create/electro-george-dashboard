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
// أنواع البيانات: أمر شراء (Header - له رقم تسلسلي وصورة) بداخله بنود
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
}

interface PurchaseOrder {
  id: number;
  order_no: string | null;
  wo_id: number | null;
  request_date: string;
  image_path: string | null;
  work_order?: { wo_number: string } | null;
  purchase_items: PurchaseItem[];
}

type ItemForm = {
  item_name: string;
  category: Category;
  quantity: string;
  supply_date: string;
  status: string;
};
const emptyItemForm = (): ItemForm => ({
  item_name: "", category: "عدد", quantity: "1", supply_date: "", status: "مفتوح",
});

type OrderForm = { order_no: string; wo_id: string; image: File | null };
const emptyOrderForm = (): OrderForm => ({ order_no: "", wo_id: "", image: null });

export default function PurchasesClient({
  initialOrders, wos, role,
}: { initialOrders: PurchaseOrder[]; wos: Pick<WorkOrder, "id" | "wo_number">[]; role: string }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>(initialOrders);
  const todayStr = today();
  const isAdmin = role === "admin";

  // ---------- مودال: أمر شراء جديد (ببنوده + صورته) ----------
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [newOrder, setNewOrder] = useState<OrderForm>(emptyOrderForm());
  const [newOrderItems, setNewOrderItems] = useState<ItemForm[]>([emptyItemForm()]);
  const [saving, setSaving] = useState(false);

  // ---------- مودال: تعديل بيانات أمر الشراء (أمر الشغل + الصورة) ----------
  const [editOrder, setEditOrder] = useState<PurchaseOrder | null>(null);
  const [editOrderForm, setEditOrderForm] = useState<OrderForm>(emptyOrderForm());

  // ---------- مودال: إضافة بند لأمر شراء موجود ----------
  const [addItemOrderId, setAddItemOrderId] = useState<number | null>(null);
  const [addItemForm, setAddItemForm] = useState<ItemForm>(emptyItemForm());

  // ---------- مودال: تعديل بند ----------
  const [editItem, setEditItem] = useState<PurchaseItem | null>(null);
  const [editItemForm, setEditItemForm] = useState<ItemForm>(emptyItemForm());

  const uploadOrderImage = async (file: File, orderId: number) => {
    const path = `purchases/${orderId}/${Date.now()}_${file.name}`;
    await supabase.storage.from("purchases").upload(path, file, { upsert: true });
    await supabase.from("purchase_orders").update({ image_path: path }).eq("id", orderId);
    return path;
  };

  const getImageUrl = (path?: string | null) => {
    if (!path) return null;
    const { data } = supabase.storage.from("purchases").getPublicUrl(path);
    return data.publicUrl;
  };

  // ---------------------------------------------------------------------
  // إنشاء أمر شراء جديد (بصورته) مع كل بنوده دفعة واحدة
  // ---------------------------------------------------------------------
  const resetNewOrder = () => { setNewOrder(emptyOrderForm()); setNewOrderItems([emptyItemForm()]); };

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
      .insert({
        order_no: newOrder.order_no.trim() || null,
        wo_id: newOrder.wo_id ? parseInt(newOrder.wo_id) : null,
        request_date: todayStr,
      })
      .select("*, work_order:work_orders(wo_number)")
      .single();
    if (orderErr) { alert(orderErr.message); setSaving(false); return; }

    let orderImagePath = order.image_path;
    if (newOrder.image) orderImagePath = await uploadOrderImage(newOrder.image, order.id);

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

    setOrders(prev => [{
      ...order,
      image_path: orderImagePath,
      purchase_items: insertedItems as PurchaseItem[],
    }, ...prev]);
    setAddOrderOpen(false); resetNewOrder(); setSaving(false);
  };

  // ---------------------------------------------------------------------
  // تعديل بيانات أمر الشراء (أمر الشغل + استبدال الصورة)
  // ---------------------------------------------------------------------
  const openEditOrder = (order: PurchaseOrder) => {
    setEditOrder(order);
    setEditOrderForm({ order_no: order.order_no ?? "", wo_id: order.wo_id ? String(order.wo_id) : "", image: null });
  };

  const submitEditOrder = async () => {
    if (!editOrder) return;
    setSaving(true);
    const payload = {
      order_no: editOrderForm.order_no.trim() || null,
      wo_id: editOrderForm.wo_id ? parseInt(editOrderForm.wo_id) : null,
    };
    const { error } = await supabase.from("purchase_orders").update(payload).eq("id", editOrder.id);
    if (error) { alert(error.message); setSaving(false); return; }
    let newImagePath = editOrder.image_path;
    if (editOrderForm.image) newImagePath = await uploadOrderImage(editOrderForm.image, editOrder.id);
    const wo = wos.find(w => String(w.id) === editOrderForm.wo_id);
    setOrders(prev => prev.map(o => o.id === editOrder.id
      ? { ...o, ...payload, image_path: newImagePath, work_order: wo ? { wo_number: wo.wo_number } : null }
      : o));
    setEditOrder(null); setSaving(false);
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
    setOrders(prev => prev.map(o => o.id === addItemOrderId
      ? { ...o, purchase_items: [...o.purchase_items, data] } : o));
    setAddItemOrderId(null); setSaving(false);
  };

  // ---------------------------------------------------------------------
  // تعديل بند
  // ---------------------------------------------------------------------
  const openEditItem = (item: PurchaseItem) => {
    setEditItem(item);
    setEditItemForm({
      item_name: item.item_name, category: item.category, quantity: String(item.quantity),
      supply_date: item.supply_date ?? "", status: item.status,
    });
  };

  const submitEditItem = async () => {
    if (!editItem) return;
    setSaving(true);
    const payload = {
      item_name: editItemForm.item_name || editItem.item_name,
      category: editItemForm.category,
      quantity: parseFloat(editItemForm.quantity) || editItem.quantity,
      status: editItemForm.status,
      supply_date: editItemForm.supply_date || null,
    };
    const { error } = await supabase.from("purchase_items").update(payload).eq("id", editItem.id);
    if (error) { alert(error.message); setSaving(false); return; }
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
  // عناصر نموذج بند قابلة لإعادة الاستخدام (بدون صورة - الصورة على الأمر)
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
    </div>
  );

  // نموذج بيانات أمر الشراء نفسه: أمر الشغل + الصورة
  const OrderFields = ({ value, onChange, currentImagePath }: {
    value: OrderForm; onChange: (patch: Partial<OrderForm>) => void; currentImagePath?: string | null;
  }) => (
    <div className="space-y-4">
      <div><label className="eg-label">رقم أمر الشراء</label>
        <input value={value.order_no} onChange={e => onChange({ order_no: e.target.value })}
          placeholder="مثال: 125 أو PO-2026-01" className="eg-input" /></div>
      <div><label className="eg-label">أمر الشغل</label>
        <select value={value.wo_id} onChange={e => onChange({ wo_id: e.target.value })} className="eg-select">
          <option value="">— بدون أمر شغل —</option>
          {wos.map(w => <option key={w.id} value={w.id}>{w.wo_number}</option>)}
        </select></div>
      <div>
        <label className="eg-label">صورة إيصال / فاتورة أمر الشراء (اختياري)</label>
        <div className="flex items-center gap-3">
          <label className="eg-btn-ghost cursor-pointer text-sm inline-flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            {value.image ? value.image.name : "اختر صورة"}
            <input type="file" accept="image/*" className="hidden"
              onChange={e => onChange({ image: e.target.files?.[0] ?? null })} />
          </label>
          {currentImagePath && !value.image && (
            <a href={getImageUrl(currentImagePath) ?? "#"} target="_blank" rel="noopener"
              className="text-accent text-xs hover:underline">عرض الصورة الحالية</a>
          )}
        </div>
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
            <summary className="flex items-center justify-between gap-3 p-3 cursor-pointer select-none list-none flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <ChevronDown className="w-4 h-4 text-subtext transition-transform group-open:rotate-180" />
                <span className="font-mono font-bold text-text">{order.order_no ? `#${order.order_no}` : "بدون رقم"}</span>
                <span className="font-mono text-accent">{order.work_order?.wo_number ?? "بدون أمر شغل"}</span>
                <span className="text-subtext text-xs">طلب بتاريخ {order.request_date}</span>
                <span className="text-subtext text-xs">· {order.purchase_items.length} بند</span>
                {order.image_path && (
                  <a href={getImageUrl(order.image_path) ?? "#"} target="_blank" rel="noopener"
                    onClick={e => e.stopPropagation()}
                    className="text-accent text-xs hover:underline flex items-center gap-1">
                    <ImageIcon className="w-3 h-3" />صورة الأمر
                  </a>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={(e) => { e.preventDefault(); openAddItem(order.id); }}
                  className="text-accent text-xs hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" />إضافة بند
                </button>
                {isAdmin && (
                  <>
                    <button onClick={(e) => { e.preventDefault(); openEditOrder(order); }}
                      className="text-accent hover:text-accent2 transition-colors">
                      <Pencil className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.preventDefault(); removeOrder(order.id); }}
                      className="text-danger/60 hover:text-danger transition-colors">
                      <Trash2 className="w-4 h-4" /></button>
                  </>
                )}
              </div>
            </summary>

            <div className="overflow-x-auto border-t border-border">
              <table className="eg-table">
                <thead><tr>
                  <th>الصنف</th><th>الكمية</th><th>الفئة</th>
                  <th>تاريخ التوريد</th><th>الحالة</th>
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
                    <tr><td colSpan={isAdmin ? 6 : 5} className="text-center text-subtext text-sm py-3">لا توجد بنود بعد</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>
        ))}
        {orders.length === 0 && <div className="eg-card"><EmptyState /></div>}
      </div>

      {/* أمر شراء جديد + صورته + بنوده */}
      <Modal open={addOrderOpen} onClose={() => { setAddOrderOpen(false); resetNewOrder(); }} title="أمر شراء جديد">
        <div className="space-y-5">
          <OrderFields value={newOrder} onChange={patch => setNewOrder(f => ({ ...f, ...patch }))} />

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

      {/* تعديل بيانات أمر الشراء (أمر الشغل + الصورة) */}
      <Modal open={!!editOrder} onClose={() => setEditOrder(null)} title={editOrder ? `تعديل الأمر ${editOrder.order_no ? "#" + editOrder.order_no : ""}` : "تعديل الأمر"}>
        <OrderFields value={editOrderForm} onChange={patch => setEditOrderForm(f => ({ ...f, ...patch }))}
          currentImagePath={editOrder?.image_path} />
        <button onClick={submitEditOrder} disabled={saving} className="eg-btn-success w-full justify-center mt-5">
          {saving ? "جاري الحفظ..." : "💾 حفظ التعديل"}
        </button>
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
        <ItemFields value={editItemForm} onChange={patch => setEditItemForm(f => ({ ...f, ...patch }))} />
        <button onClick={submitEditItem} disabled={saving} className="eg-btn-success w-full justify-center mt-5">
          {saving ? "جاري الحفظ..." : "💾 حفظ التعديل"}
        </button>
      </Modal>
    </div>
  );
}
