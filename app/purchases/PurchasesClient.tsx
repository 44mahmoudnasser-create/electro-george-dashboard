"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { WorkOrder } from "@/types";
import { today, cn } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Field, { FormError } from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import Tooltip from "@/components/ui/Tooltip";
import { Page, PageHeader, PageBody } from "@/components/ui/Page";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  Plus, Pencil, Trash2, Image as ImageIcon, ChevronDown, ShoppingCart, Save, ExternalLink, Package, PackageCheck,
} from "lucide-react";

// ---------------------------------------------------------------------
// أنواع البيانات: أمر شراء (Header - له رقم تسلسلي وصورة) بداخله بنود
// ---------------------------------------------------------------------
const CATEGORIES = ["عدد", "كيلو", "متر", "علبة"] as const;
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

type WOOption = Pick<WorkOrder, "id" | "wo_number">;

// رابط الصورة العام من الـ storage
const getImageUrl = (path?: string | null) => {
  if (!path) return null;
  const { data } = supabase.storage.from("purchases").getPublicUrl(path);
  return data.publicUrl;
};

const orderLabel = (o: Pick<PurchaseOrder, "order_no">) => (o.order_no ? `#${o.order_no}` : "بدون رقم");

export default function PurchasesClient({
  initialOrders, wos, role,
}: { initialOrders: PurchaseOrder[]; wos: WOOption[]; role: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [orders, setOrders] = useState<PurchaseOrder[]>(initialOrders);
  // بنود محددة للتسجيل الجماعي للتوريد (بتتحدد بالـ checkbox)
  const [selItems, setSelItems] = useState<Set<number>>(new Set());
  const todayStr = today();
  const isAdmin = role === "admin";

  // ---------- مودال: أمر شراء جديد (ببنوده + صورته) ----------
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [newOrder, setNewOrder] = useState<OrderForm>(emptyOrderForm());
  const [newOrderItems, setNewOrderItems] = useState<ItemForm[]>([emptyItemForm()]);
  const [newOrderError, setNewOrderError] = useState("");
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

  // بيرجع مسار الصورة لو الرفع والحفظ نجحوا، وإلا null (والخطأ بيظهر كإشعار)
  const uploadOrderImage = async (file: File, orderId: number): Promise<string | null> => {
    const path = `purchases/${orderId}/${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("purchases").upload(path, file, { upsert: true });
    if (uploadErr) { toast.error(`تعذّر رفع الصورة: ${uploadErr.message}`); return null; }
    const { error: updateErr } = await supabase.from("purchase_orders").update({ image_path: path }).eq("id", orderId);
    if (updateErr) { toast.error(updateErr.message); return null; }
    return path;
  };

  // ---------------------------------------------------------------------
  // إنشاء أمر شراء جديد (بصورته) مع كل بنوده دفعة واحدة
  // ---------------------------------------------------------------------
  const resetNewOrder = () => { setNewOrder(emptyOrderForm()); setNewOrderItems([emptyItemForm()]); setNewOrderError(""); };
  const closeNewOrder = () => { setAddOrderOpen(false); resetNewOrder(); };

  const updateNewOrderItem = (idx: number, patch: Partial<ItemForm>) => {
    setNewOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const addNewOrderRow = () => setNewOrderItems(prev => [...prev, emptyItemForm()]);
  const removeNewOrderRow = (idx: number) => setNewOrderItems(prev => prev.filter((_, i) => i !== idx));

  const createOrder = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    const validItems = newOrderItems.filter(it => it.item_name.trim());
    if (validItems.length === 0) { setNewOrderError("لازم بند واحد على الأقل بيه اسم صنف"); return; }
    setNewOrderError("");
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
    if (orderErr) { toast.error(orderErr.message); setSaving(false); return; }

    let orderImagePath = order.image_path;
    if (newOrder.image) orderImagePath = (await uploadOrderImage(newOrder.image, order.id)) ?? order.image_path;

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
    if (itemsErr) { toast.error(itemsErr.message); setSaving(false); return; }

    setOrders(prev => [{
      ...order,
      image_path: orderImagePath,
      purchase_items: insertedItems as PurchaseItem[],
    }, ...prev]);
    setAddOrderOpen(false); resetNewOrder(); setSaving(false);
    toast.success("تم حفظ أمر الشراء");
  };

  // ---------------------------------------------------------------------
  // تعديل بيانات أمر الشراء (أمر الشغل + استبدال الصورة)
  // ---------------------------------------------------------------------
  const openEditOrder = (order: PurchaseOrder) => {
    setEditOrder(order);
    setEditOrderForm({ order_no: order.order_no ?? "", wo_id: order.wo_id ? String(order.wo_id) : "", image: null });
  };

  const submitEditOrder = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editOrder || saving) return;
    setSaving(true);
    const payload = {
      order_no: editOrderForm.order_no.trim() || null,
      wo_id: editOrderForm.wo_id ? parseInt(editOrderForm.wo_id) : null,
    };
    const { error } = await supabase.from("purchase_orders").update(payload).eq("id", editOrder.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    let newImagePath = editOrder.image_path;
    if (editOrderForm.image) newImagePath = (await uploadOrderImage(editOrderForm.image, editOrder.id)) ?? editOrder.image_path;
    const wo = wos.find(w => String(w.id) === editOrderForm.wo_id);
    setOrders(prev => prev.map(o => o.id === editOrder.id
      ? { ...o, ...payload, image_path: newImagePath, work_order: wo ? { wo_number: wo.wo_number } : null }
      : o));
    setEditOrder(null); setSaving(false);
    toast.success("تم حفظ التعديل");
  };

  // ---------------------------------------------------------------------
  // إضافة بند لأمر شراء موجود
  // ---------------------------------------------------------------------
  const openAddItem = (orderId: number) => { setAddItemOrderId(orderId); setAddItemForm(emptyItemForm()); };

  const submitAddItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (addItemOrderId == null || !addItemForm.item_name.trim() || saving) return;
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
    if (error) { toast.error(error.message); setSaving(false); return; }
    setOrders(prev => prev.map(o => o.id === addItemOrderId
      ? { ...o, purchase_items: [...o.purchase_items, data] } : o));
    setAddItemOrderId(null); setSaving(false);
    toast.success("تمت إضافة البند");
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

  const submitEditItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editItem || saving) return;
    setSaving(true);
    const payload = {
      item_name: editItemForm.item_name || editItem.item_name,
      category: editItemForm.category,
      quantity: parseFloat(editItemForm.quantity) || editItem.quantity,
      status: editItemForm.status,
      supply_date: editItemForm.supply_date || null,
    };
    const { error } = await supabase.from("purchase_items").update(payload).eq("id", editItem.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    setOrders(prev => prev.map(o => ({
      ...o,
      purchase_items: o.purchase_items.map(it => it.id === editItem.id ? { ...it, ...payload } : it),
    })));
    setEditItem(null); setSaving(false);
    toast.success("تم حفظ التعديل");
  };

  // ---------------------------------------------------------------------
  // حذف بند / حذف أمر شراء كامل
  // ---------------------------------------------------------------------
  // تسجيل التوريد: البند بيتحول لـ "تم التوريد"، ولو مفيش تاريخ توريد بيتحط تاريخ النهاردة
  const markSupplied = async (orderId: number, list: PurchaseItem[]) => {
    const open = list.filter(it => it.status === "مفتوح");
    if (open.length === 0) { toast.error("مفيش بنود مفتوحة للتسجيل"); return; }
    const ok = await confirm({
      title: open.length === 1 ? "تسجيل توريد البند؟" : `تسجيل توريد ${open.length} بند؟`,
      message: <>هيتسجلوا كـ <span className="font-semibold text-text">تم التوريد</span>.</>,
      confirmText: "تسجيل التوريد",
    });
    if (!ok) return;
    const withDate = open.filter(it => it.supply_date).map(it => it.id);
    const withoutDate = open.filter(it => !it.supply_date).map(it => it.id);
    if (withDate.length) {
      const { error } = await supabase.from("purchase_items").update({ status: "تم التوريد" }).in("id", withDate);
      if (error) { toast.error(error.message); return; }
    }
    if (withoutDate.length) {
      const { error } = await supabase.from("purchase_items")
        .update({ status: "تم التوريد", supply_date: todayStr }).in("id", withoutDate);
      if (error) { toast.error(error.message); return; }
    }
    const doneIds = new Set(open.map(it => it.id));
    setOrders(prev => prev.map(o => o.id === orderId ? {
      ...o,
      purchase_items: o.purchase_items.map(it => doneIds.has(it.id)
        ? { ...it, status: "تم التوريد", supply_date: it.supply_date ?? todayStr } : it),
    } : o));
    setSelItems(prev => { const n = new Set(prev); doneIds.forEach(id => n.delete(id)); return n; });
    toast.success(`تم تسجيل توريد ${open.length} بند`);
  };

  const removeItem = async (orderId: number, item: PurchaseItem) => {
    const ok = await confirm({
      title: "حذف هذا البند؟",
      message: <>هيتحذف بند <span className="font-semibold text-text">{item.item_name}</span> من أمر الشراء.</>,
      confirmText: "حذف البند",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("purchase_items").delete().eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    setOrders(prev => prev.map(o => o.id === orderId
      ? { ...o, purchase_items: o.purchase_items.filter(it => it.id !== item.id) } : o));
    toast.success("تم حذف البند");
  };

  const removeOrder = async (order: PurchaseOrder) => {
    const n = order.purchase_items.length;
    const ok = await confirm({
      title: "حذف أمر الشراء ده بكل بنوده؟",
      message: (
        <>
          هيتحذف أمر الشراء <span className="font-semibold text-text">{orderLabel(order)}</span>
          {n > 0 ? <> ومعاه <span className="tabular-nums">{n}</span> بند</> : null}.
        </>
      ),
      confirmText: "حذف الأمر",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("purchase_orders").delete().eq("id", order.id);
    if (error) { toast.error(error.message); return; }
    setOrders(prev => prev.filter(o => o.id !== order.id));
    toast.success("تم حذف أمر الشراء");
  };

  const addItemOrder = addItemOrderId !== null ? orders.find(o => o.id === addItemOrderId) : undefined;

  const newOrderButton = (
    <button type="button" onClick={() => setAddOrderOpen(true)} className="eg-btn-primary eg-btn-sm">
      <Plus className="size-3.5" />أمر شراء جديد
    </button>
  );

  return (
    <Page width="6xl">
      <PageHeader
        title="طلبات الشراء"
        icon={ShoppingCart}
        subtitle={<span className="tabular-nums">{orders.length} أمر شراء</span>}
        actions={newOrderButton}
      />

      <PageBody>
        {orders.length === 0 ? (
          <div className="eg-card">
            <EmptyState
              icon={ShoppingCart}
              message="لسه مفيش أوامر شراء"
              description="ابدأ بإضافة أول أمر شراء ببنوده وصورة الفاتورة."
              action={newOrderButton}
            />
          </div>
        ) : (
          <div className="eg-stagger space-y-3">
            {orders.map(order => {
              const imageUrl = getImageUrl(order.image_path);
              const count = order.purchase_items.length;
              return (
                <details key={order.id} open className="eg-card group overflow-hidden !p-0">
                  <summary className="flex cursor-pointer select-none list-none flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 outline-none transition-colors hover:bg-card2/40 focus-visible:bg-card2/60 group-open:border-b group-open:border-border/60 [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                      <ChevronDown aria-hidden className="size-4 shrink-0 rotate-90 text-muted transition-transform duration-200 group-open:rotate-0" />
                      <span className={cn("text-sm font-bold", order.order_no ? "font-mono text-text" : "text-subtext")}>
                        {orderLabel(order)}
                      </span>
                      {order.work_order?.wo_number
                        ? <span className="font-mono text-[13px] font-semibold text-accent">{order.work_order.wo_number}</span>
                        : <span className="text-xs text-subtext">بدون أمر شغل</span>}
                      <span className="text-xs text-subtext">
                        طلب بتاريخ <span className="tabular-nums">{order.request_date}</span>
                      </span>
                      <Badge label={`${count} بند`} tone="neutral" dot={false} className="tabular-nums" />
                      {imageUrl && (
                        <a href={imageUrl} target="_blank" rel="noopener"
                          onClick={e => e.stopPropagation()}
                          className="eg-link inline-flex items-center gap-1 text-xs">
                          <ImageIcon className="size-3.5" />صورة الأمر
                        </a>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={e => { e.preventDefault(); openAddItem(order.id); }}
                        className="eg-btn-ghost eg-btn-xs">
                        <Plus className="size-3" />إضافة بند
                      </button>
                      {isAdmin && (
                        <>
                          <Tooltip content="تعديل الأمر">
                            <button type="button" aria-label="تعديل أمر الشراء"
                              onClick={e => { e.preventDefault(); openEditOrder(order); }}
                              className="eg-icon-btn">
                              <Pencil className="size-3.5" />
                            </button>
                          </Tooltip>
                          <Tooltip content="حذف الأمر">
                            <button type="button" aria-label="حذف أمر الشراء"
                              onClick={e => { e.preventDefault(); removeOrder(order); }}
                              className="eg-icon-btn-danger">
                              <Trash2 className="size-3.5" />
                            </button>
                          </Tooltip>
                        </>
                      )}
                    </div>
                  </summary>

                  {isAdmin && (() => {
                    const selHere = order.purchase_items.filter(it => selItems.has(it.id));
                    return selHere.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-accent/5 px-4 py-2">
                        <span className="text-xs text-text">تم تحديد <span className="font-bold tabular-nums">{selHere.length}</span> بند</span>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setSelItems(new Set())} className="eg-btn-ghost eg-btn-sm">إلغاء</button>
                          <button type="button" onClick={() => markSupplied(order.id, selHere)} className="eg-btn-primary eg-btn-sm">
                            <PackageCheck className="size-3.5" />تسجيل التوريد
                          </button>
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {count > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="eg-table min-w-[600px]">
                        <thead>
                          <tr>
                            {isAdmin && <th className="w-10"><span className="sr-only">تحديد</span></th>}
                            <th>الصنف</th>
                            <th className="w-24">الكمية</th>
                            <th className="w-24">الفئة</th>
                            <th className="w-44">تاريخ التوريد</th>
                            <th className="w-28">الحالة</th>
                            {isAdmin && <th className="w-20"><span className="sr-only">إجراءات</span></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {order.purchase_items.map(item => {
                            const late = !!item.supply_date && item.supply_date < todayStr && item.status === "مفتوح";
                            return (
                              <tr key={item.id}>
                                {isAdmin && (
                                  <td>
                                    {item.status === "مفتوح" && (
                                      <input type="checkbox" aria-label={`تحديد ${item.item_name}`}
                                        checked={selItems.has(item.id)}
                                        onChange={() => setSelItems(prev => {
                                          const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n;
                                        })}
                                        className="accent-emerald-500 size-4 cursor-pointer" />
                                    )}
                                  </td>
                                )}
                                <td className="font-medium text-text">{item.item_name}</td>
                                <td className="tabular-nums">{item.quantity}</td>
                                <td className="text-subtext">{item.category}</td>
                                <td className={cn("tabular-nums", late ? "font-semibold text-danger" : "text-subtext")}>
                                  {item.supply_date ?? "—"}
                                  {late && <span className="mr-1.5 rounded bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium">متأخر</span>}
                                </td>
                                <td><Badge label={item.status} /></td>
                                {isAdmin && (
                                  <td>
                                    <div className="flex items-center justify-end gap-0.5">
                                      {item.status === "مفتوح" && (
                                        <Tooltip content="تسجيل التوريد">
                                          <button type="button" onClick={() => markSupplied(order.id, [item])}
                                            className="eg-icon-btn" aria-label="تسجيل توريد البند">
                                            <PackageCheck className="size-3.5" />
                                          </button>
                                        </Tooltip>
                                      )}
                                      <Tooltip content="تعديل">
                                        <button type="button" onClick={() => openEditItem(item)}
                                          className="eg-icon-btn" aria-label="تعديل البند">
                                          <Pencil className="size-3.5" />
                                        </button>
                                      </Tooltip>
                                      <Tooltip content="حذف">
                                        <button type="button" onClick={() => removeItem(order.id, item)}
                                          className="eg-icon-btn-danger" aria-label="حذف البند">
                                          <Trash2 className="size-3.5" />
                                        </button>
                                      </Tooltip>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState
                      compact
                      icon={Package}
                      message="لا توجد بنود بعد"
                      action={
                        <button type="button" onClick={() => openAddItem(order.id)} className="eg-btn-ghost eg-btn-xs">
                          <Plus className="size-3" />إضافة بند
                        </button>
                      }
                    />
                  )}
                </details>
              );
            })}
          </div>
        )}
      </PageBody>

      {/* أمر شراء جديد + صورته + بنوده */}
      <Modal open={addOrderOpen} onClose={closeNewOrder} title="أمر شراء جديد">
        <form onSubmit={createOrder} className="space-y-5">
          <OrderFields value={newOrder} onChange={patch => setNewOrder(f => ({ ...f, ...patch }))} wos={wos} autoFocus />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-text">البنود</h3>
              <span className="text-xs tabular-nums text-subtext">{newOrderItems.length} بند</span>
            </div>
            {newOrderItems.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-border/70 bg-card2/40 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-subtext">بند {idx + 1}</span>
                  {newOrderItems.length > 1 && (
                    <button type="button" onClick={() => removeNewOrderRow(idx)} className="eg-btn-danger-soft eg-btn-xs">
                      <Trash2 className="size-3" />حذف البند
                    </button>
                  )}
                </div>
                {/* البند الجديد بياخد التركيز أول ما يتضاف */}
                <ItemFields value={item} onChange={patch => updateNewOrderItem(idx, patch)} autoFocus={idx > 0} />
              </div>
            ))}
            <button type="button" onClick={addNewOrderRow} className="eg-btn-ghost eg-btn-sm w-full border-dashed">
              <Plus className="size-3.5" />إضافة بند تاني
            </button>
          </div>

          <FormError>{newOrderError}</FormError>
          <button type="submit" disabled={saving} className="eg-btn-primary w-full">
            {saving ? <Spinner /> : <Save className="size-4" />}
            {saving ? "جاري الحفظ..." : "حفظ أمر الشراء"}
          </button>
        </form>
      </Modal>

      {/* تعديل بيانات أمر الشراء (أمر الشغل + الصورة) */}
      <Modal open={!!editOrder} onClose={() => setEditOrder(null)}
        title={editOrder?.order_no ? `تعديل الأمر #${editOrder.order_no}` : "تعديل الأمر"}>
        <form onSubmit={submitEditOrder} className="space-y-5">
          <OrderFields value={editOrderForm} onChange={patch => setEditOrderForm(f => ({ ...f, ...patch }))}
            wos={wos} currentImageUrl={getImageUrl(editOrder?.image_path)} autoFocus />
          <button type="submit" disabled={saving} className="eg-btn-success w-full">
            {saving ? <Spinner /> : <Save className="size-4" />}
            {saving ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </form>
      </Modal>

      {/* إضافة بند لأمر شراء موجود */}
      <Modal open={addItemOrderId !== null} onClose={() => setAddItemOrderId(null)} title="إضافة بند"
        description={addItemOrder
          ? <>أمر الشراء <span className="font-mono">{orderLabel(addItemOrder)}</span>{addItemOrder.work_order?.wo_number && <> · <span className="font-mono">{addItemOrder.work_order.wo_number}</span></>}</>
          : undefined}>
        <form onSubmit={submitAddItem} className="space-y-5">
          <ItemFields value={addItemForm} onChange={patch => setAddItemForm(f => ({ ...f, ...patch }))} autoFocus />
          <button type="submit" disabled={saving || !addItemForm.item_name.trim()} className="eg-btn-primary w-full">
            {saving ? <Spinner /> : <Save className="size-4" />}
            {saving ? "جاري الحفظ..." : "حفظ البند"}
          </button>
        </form>
      </Modal>

      {/* تعديل بند */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="تعديل البند">
        <form onSubmit={submitEditItem} className="space-y-5">
          <ItemFields value={editItemForm} onChange={patch => setEditItemForm(f => ({ ...f, ...patch }))} autoFocus />
          <button type="submit" disabled={saving} className="eg-btn-success w-full">
            {saving ? <Spinner /> : <Save className="size-4" />}
            {saving ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </form>
      </Modal>
    </Page>
  );
}

// ---------------------------------------------------------------------
// عناصر نموذج بند قابلة لإعادة الاستخدام (بدون صورة - الصورة على الأمر)
// متعرفة برّه المكوّن الرئيسي علشان الحقول ماتتعملهاش mount من جديد مع كل حرف
// ---------------------------------------------------------------------
function ItemFields({ value, onChange, autoFocus }: {
  value: ItemForm; onChange: (patch: Partial<ItemForm>) => void; autoFocus?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="الصنف" required className="col-span-2">
        <input value={value.item_name} onChange={e => onChange({ item_name: e.target.value })}
          className="eg-input" autoFocus={autoFocus} />
      </Field>
      <Field label="الكمية">
        <input type="number" min="0.01" step="any" value={value.quantity}
          onChange={e => onChange({ quantity: e.target.value })} className="eg-input tabular-nums" />
      </Field>
      <Field label="الفئة">
        <select value={value.category} onChange={e => onChange({ category: e.target.value as Category })} className="eg-select">
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="تاريخ التوريد المتوقع" className="col-span-2 sm:col-span-1">
        <input type="date" value={value.supply_date} onChange={e => onChange({ supply_date: e.target.value })} className="eg-input" />
      </Field>
      <Field label="الحالة" className="col-span-2 sm:col-span-1">
        <select value={value.status} onChange={e => onChange({ status: e.target.value })} className="eg-select">
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </Field>
    </div>
  );
}

// نموذج بيانات أمر الشراء نفسه: رقم الأمر + أمر الشغل + الصورة
function OrderFields({ value, onChange, wos, currentImageUrl, autoFocus }: {
  value: OrderForm;
  onChange: (patch: Partial<OrderForm>) => void;
  wos: WOOption[];
  currentImageUrl?: string | null;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="رقم أمر الشراء">
          <input value={value.order_no} onChange={e => onChange({ order_no: e.target.value })}
            placeholder="مثال: 125 أو PO-2026-01" className="eg-input" autoFocus={autoFocus} />
        </Field>
        <Field label="أمر الشغل">
          <select value={value.wo_id} onChange={e => onChange({ wo_id: e.target.value })} className="eg-select">
            <option value="">— بدون أمر شغل —</option>
            {wos.map(w => <option key={w.id} value={w.id}>{w.wo_number}</option>)}
          </select>
        </Field>
      </div>
      <Field label="صورة إيصال / فاتورة أمر الشراء (اختياري)">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className={cn(
            "eg-btn-ghost eg-btn-sm max-w-full cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/60",
            value.image && "border-accent/40 text-accent",
          )}>
            <ImageIcon className="size-3.5 shrink-0" />
            <span className="max-w-[15rem] truncate">{value.image ? value.image.name : "اختر صورة"}</span>
            <input type="file" accept="image/*" className="sr-only"
              onChange={e => onChange({ image: e.target.files?.[0] ?? null })} />
          </label>
          {currentImageUrl && !value.image && (
            <a href={currentImageUrl} target="_blank" rel="noopener"
              className="eg-link inline-flex items-center gap-1 text-xs">
              <ExternalLink className="size-3" />عرض الصورة الحالية
            </a>
          )}
        </div>
      </Field>
    </div>
  );
}
