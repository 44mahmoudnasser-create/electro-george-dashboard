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
// أنواع البيانات: أمر شراء (Header - له رقم تسلسلي وصور) بداخله بنود
// ---------------------------------------------------------------------
const CATEGORIES = ["عدد", "كيلو", "متر", "علبة"] as const;
type Category = typeof CATEGORIES[number];
// حالات البند (لازم تطابق purchase_items_status_check في 034)
const STATUSES = ["مفتوح", "تم التوريد جزئيا", "تم التوريد", "ملغي"] as const;
// حالات أمر الشراء (الهيدر) — 4 حالات
const ORDER_STATUSES = ["جديد", "مفتوح", "تم التوريد", "تم التوريد جزئيا"] as const;
// الأمر "تم التوريد جزئيا" بيقفل التعديل على السكرتير (نفس قفل الداتابيز في 031)
const PARTIAL_STATUS = "تم التوريد جزئيا";
// البند اللي لسه فيه كمية مستنية (مفتوح أو توريد جزئي)
const isOpenItem = (status: string) => status === "مفتوح" || status === "تم التوريد جزئيا";

interface PurchaseItem {
  id: number;
  purchase_order_id: number;
  item_name: string;
  category: Category;
  quantity: number;
  received_qty: number;                  // الكمية اللي اتوردت فعلاً
  status: string;
  expected_supply_date: string | null;   // التاريخ المتوقع للتوريد
  supply_date: string | null;            // آخر تاريخ توريد فعلي
}

interface OrderImage {
  id: number;
  image_path: string;
}

interface PurchaseOrder {
  id: number;
  order_no: string | null;
  wo_id: number | null;
  request_date: string;
  status: string;
  department?: string | null;
  created_by?: string | null;
  work_order?: { wo_number: string } | null;
  images: OrderImage[];
  purchase_items: PurchaseItem[];
}

type ItemForm = {
  item_name: string;
  category: Category;
  quantity: string;
  expected_supply_date: string;
  status: string;
};
const emptyItemForm = (): ItemForm => ({
  item_name: "", category: "عدد", quantity: "1", expected_supply_date: "", status: "مفتوح",
});

type OrderForm = { order_no: string; wo_id: string; status: string; images: File[] };
const emptyOrderForm = (): OrderForm => ({ order_no: "", wo_id: "", status: "جديد", images: [] });

type WOOption = Pick<WorkOrder, "id" | "wo_number">;

// رابط الصورة العام من الـ storage
const getImageUrl = (path?: string | null) => {
  if (!path) return null;
  const { data } = supabase.storage.from("purchases").getPublicUrl(path);
  return data.publicUrl;
};

const orderLabel = (o: Pick<PurchaseOrder, "order_no">) => (o.order_no ? `#${o.order_no}` : "بدون رقم");

export default function PurchasesClient({
  initialOrders, wos, role, department, userId,
}: { initialOrders: PurchaseOrder[]; wos: WOOption[]; role: string; department: string | null; userId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [orders, setOrders] = useState<PurchaseOrder[]>(initialOrders);
  // بنود محددة للتوريد الجماعي (بتتحدد بالـ checkbox)
  const [selItems, setSelItems] = useState<Set<number>>(new Set());
  const todayStr = today();

  // ---------- الصلاحيات ----------
  const isManager = role === "manager";
  // قسم الشراء: يسجل التوريد بس
  const isPurchaseDept = (department ?? "").toLowerCase() === "purchase";
  // التوريد (كامل أو جزئي): المدير وقسم الشراء بس
  const canReceive = isManager || isPurchaseDept;
  // أي تعديل على أمر أو بند (إضافة / تعديل / حذف / صور): المدير بس
  const canEditOrder = (_o: PurchaseOrder) => isManager;
  // السكرتير يقدر ينشئ أمر جديد في قسمه، ويضيف بنود/صور لأمره هو طالما لسه "جديد"
  const isSecretary = role === "secretary";
  const canCreateOrder = isManager || isSecretary;
  const canAddItem = (o: PurchaseOrder) =>
    isManager || (isSecretary && o.status === "جديد" && o.created_by === userId);

  // ---------- مودال: أمر شراء جديد (ببنوده + صوره) ----------
  const [addOrderOpen, setAddOrderOpen] = useState(false);
  const [newOrder, setNewOrder] = useState<OrderForm>(emptyOrderForm());
  const [newOrderItems, setNewOrderItems] = useState<ItemForm[]>([emptyItemForm()]);
  const [newOrderError, setNewOrderError] = useState("");
  const [saving, setSaving] = useState(false);

  // ---------- مودال: تعديل بيانات أمر الشراء (أمر الشغل + الصور) ----------
  const [editOrder, setEditOrder] = useState<PurchaseOrder | null>(null);
  const [editOrderForm, setEditOrderForm] = useState<OrderForm>(emptyOrderForm());

  // ---------- مودال: إضافة بند لأمر شراء موجود ----------
  const [addItemOrderId, setAddItemOrderId] = useState<number | null>(null);
  const [addItemForm, setAddItemForm] = useState<ItemForm>(emptyItemForm());

  // ---------- مودال: تعديل بند ----------
  const [editItem, setEditItem] = useState<PurchaseItem | null>(null);
  const [editItemForm, setEditItemForm] = useState<ItemForm>(emptyItemForm());

  // ---------- مودال: تسجيل التوريد (كامل أو جزئي بالكمية) ----------
  const [receiveOrderId, setReceiveOrderId] = useState<number | null>(null);
  const [receiveItems, setReceiveItems] = useState<PurchaseItem[]>([]);
  const [receiveQty, setReceiveQty] = useState<Record<number, string>>({});

  // بيرجع الصورة بعد ما تترفع وتتسجل في الجدول، وإلا null (والخطأ بيظهر كإشعار)
  const uploadOrderImage = async (file: File, orderId: number): Promise<OrderImage | null> => {
    const path = `purchases/${orderId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("purchases").upload(path, file, { upsert: true });
    if (uploadErr) { toast.error(`تعذّر رفع الصورة: ${uploadErr.message}`); return null; }
    const { data, error: insertErr } = await supabase
      .from("purchase_order_images")
      .insert({ purchase_order_id: orderId, image_path: path })
      .select("id, image_path")
      .single();
    if (insertErr) { toast.error(insertErr.message); return null; }
    return data as OrderImage;
  };

  // ---------------------------------------------------------------------
  // إنشاء أمر شراء جديد (بصوره) مع كل بنوده دفعة واحدة
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
    if (newOrder.images.length === 0) { setNewOrderError("لازم صورة واحدة على الأقل للأمر"); return; }
    setNewOrderError("");
    setSaving(true);

    const { data: order, error: orderErr } = await supabase
      .from("purchase_orders")
      .insert({
        order_no: newOrder.order_no.trim() || null,
        wo_id: newOrder.wo_id ? parseInt(newOrder.wo_id) : null,
        request_date: todayStr,
        status: isManager ? newOrder.status : "جديد",
        department: department || null,
      })
      .select("*, work_order:work_orders(wo_number)")
      .single();
    if (orderErr) { toast.error(orderErr.message); setSaving(false); return; }

    const images: OrderImage[] = [];
    for (const f of newOrder.images) {
      const img = await uploadOrderImage(f, order.id);
      if (img) images.push(img);
    }

    const rowsToInsert = validItems.map(it => ({
      purchase_order_id: order.id,
      item_name: it.item_name,
      category: it.category,
      quantity: parseFloat(it.quantity) || 1,
      received_qty: isManager && it.status === "تم التوريد" ? (parseFloat(it.quantity) || 1) : 0,
      status: isManager ? it.status : "مفتوح",
      expected_supply_date: it.expected_supply_date || null,
    }));
    const { data: insertedItems, error: itemsErr } = await supabase
      .from("purchase_items").insert(rowsToInsert).select("*");
    if (itemsErr) { toast.error(itemsErr.message); setSaving(false); return; }

    setOrders(prev => [{
      ...order,
      images,
      purchase_items: insertedItems as PurchaseItem[],
    }, ...prev]);
    setAddOrderOpen(false); resetNewOrder(); setSaving(false);
    if (images.length < newOrder.images.length) toast.error("الأمر اتحفظ بس بعض الصور ماتحفظتش، ضيفها من تعديل الأمر");
    else toast.success("تم حفظ أمر الشراء");
  };

  // ---------------------------------------------------------------------
  // تعديل بيانات أمر الشراء (أمر الشغل + إضافة صور + حذف صورة)
  // ---------------------------------------------------------------------
  const openEditOrder = (order: PurchaseOrder) => {
    setEditOrder(order);
    setEditOrderForm({
      order_no: order.order_no ?? "", wo_id: order.wo_id ? String(order.wo_id) : "", status: order.status, images: [],
    });
  };

  const submitEditOrder = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editOrder || saving) return;
    if (editOrder.images.length + editOrderForm.images.length === 0) { toast.error("لازم صورة واحدة على الأقل للأمر"); return; }
    setSaving(true);
    const payload = {
      order_no: editOrderForm.order_no.trim() || null,
      wo_id: editOrderForm.wo_id ? parseInt(editOrderForm.wo_id) : null,
      status: editOrderForm.status,
    };
    const { error } = await supabase.from("purchase_orders").update(payload).eq("id", editOrder.id);
    if (error) { toast.error(error.message); setSaving(false); return; }
    const added: OrderImage[] = [];
    for (const f of editOrderForm.images) {
      const img = await uploadOrderImage(f, editOrder.id);
      if (img) added.push(img);
    }
    const wo = wos.find(w => String(w.id) === editOrderForm.wo_id);
    const images = [...editOrder.images, ...added];
    setOrders(prev => prev.map(o => o.id === editOrder.id
      ? { ...o, ...payload, images, work_order: wo ? { wo_number: wo.wo_number } : null }
      : o));
    setEditOrder(null); setSaving(false);
    toast.success("تم حفظ التعديل");
  };

  // حذف صورة محفوظة من الأمر (لازم يفضل صورة واحدة على الأقل)
  const removeOrderImage = async (img: OrderImage) => {
    if (!editOrder) return;
    if (editOrder.images.length + editOrderForm.images.length <= 1) { toast.error("لازم يفضل صورة واحدة على الأقل"); return; }
    const ok = await confirm({
      title: "حذف هذه الصورة؟",
      message: "هتتشال الصورة من أمر الشراء.",
      confirmText: "حذف الصورة",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("purchase_order_images").delete().eq("id", img.id);
    if (error) { toast.error(error.message); return; }
    const remaining = editOrder.images.filter(i => i.id !== img.id);
    setEditOrder({ ...editOrder, images: remaining });
    setOrders(prev => prev.map(o => o.id === editOrder.id ? { ...o, images: remaining } : o));
    toast.success("تم حذف الصورة");
  };

  // ---------------------------------------------------------------------
  // إضافة بند لأمر شراء موجود
  // ---------------------------------------------------------------------
  const openAddItem = (orderId: number) => { setAddItemOrderId(orderId); setAddItemForm(emptyItemForm()); };

  const submitAddItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (addItemOrderId == null || !addItemForm.item_name.trim() || saving) return;
    setSaving(true);
    const quantity = parseFloat(addItemForm.quantity) || 1;
    const payload = {
      purchase_order_id: addItemOrderId,
      item_name: addItemForm.item_name,
      category: addItemForm.category,
      quantity,
      received_qty: isManager && addItemForm.status === "تم التوريد" ? quantity : 0,
      status: isManager ? addItemForm.status : "مفتوح",
      expected_supply_date: addItemForm.expected_supply_date || null,
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
      expected_supply_date: item.expected_supply_date ?? "", status: item.status,
    });
  };

  const submitEditItem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editItem || saving) return;
    setSaving(true);
    const quantity = parseFloat(editItemForm.quantity) || editItem.quantity;
    const status = editItemForm.status;
    // التعديل اليدوي للحالة بيتعامل مع الكمية المستلمة: "تم التوريد" = كل الكمية، "مفتوح" = صفر
    const received_qty = status === "تم التوريد" ? quantity : status === "مفتوح" ? 0 : Math.min(editItem.received_qty, quantity);
    const payload = {
      item_name: editItemForm.item_name || editItem.item_name,
      category: editItemForm.category,
      quantity,
      received_qty,
      status,
      expected_supply_date: editItemForm.expected_supply_date || null,
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
  // تسجيل التوريد: كامل أو جزئي بالكمية لكل بند
  // الكمية المستلمة الآن بتتضاف للمستلم قبل كده، ولو وصلت للمطلوب البند بيتقفل "تم التوريد"
  // ---------------------------------------------------------------------
  const openReceive = (orderId: number, list: PurchaseItem[]) => {
    const open = list.filter(it => isOpenItem(it.status));
    if (open.length === 0) { toast.error("مفيش بنود مفتوحة للتوريد"); return; }
    setReceiveOrderId(orderId);
    setReceiveItems(open);
    setReceiveQty(Object.fromEntries(open.map(it => [it.id, String(Math.max(0, it.quantity - it.received_qty))])));
  };

  const closeReceive = () => { setReceiveOrderId(null); setReceiveItems([]); setReceiveQty({}); };

  // الكمية اللي هتتسجل لكل بند (بتتقص على المتبقي عشان مايتعداش المطلوب)
  const receiveRows = receiveItems.map(it => {
    const remaining = Math.max(0, it.quantity - it.received_qty);
    const raw = parseFloat(receiveQty[it.id] ?? "");
    const now = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), remaining) : 0;
    const total = it.received_qty + now;
    const status = total >= it.quantity ? "تم التوريد" : total > 0 ? "تم التوريد جزئيا" : it.status;
    return { item: it, remaining, now, total, status };
  });
  const receiveTotal = receiveRows.reduce((a, r) => a + r.now, 0);

  const submitReceive = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (receiveOrderId == null || saving) return;
    const rows = receiveRows.filter(r => r.now > 0);
    if (rows.length === 0) { toast.error("ادخل كمية أكبر من صفر"); return; }
    const ok = await confirm({
      title: rows.length === 1 ? "تسجيل التوريد؟" : `تسجيل توريد ${rows.length} بند؟`,
      message: <>هيتسجل التوريد بتاريخ النهاردة، والبنود اللي اتوردت كلها هتتقفل كـ <span className="font-semibold text-text">تم التوريد</span>، والباقي كـ <span className="font-semibold text-text">تم التوريد جزئيا</span>.</>,
      confirmText: "تسجيل التوريد",
    });
    if (!ok) return;
    setSaving(true);
    for (const r of rows) {
      const { error } = await supabase.from("purchase_items")
        .update({ received_qty: r.total, status: r.status, supply_date: todayStr })
        .eq("id", r.item.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    const byId = new Map(rows.map(r => [r.item.id, r]));
    setOrders(prev => prev.map(o => o.id === receiveOrderId ? {
      ...o,
      purchase_items: o.purchase_items.map(it => {
        const r = byId.get(it.id);
        return r ? { ...it, received_qty: r.total, status: r.status, supply_date: todayStr } : it;
      }),
    } : o));
    setSelItems(prev => { const n = new Set(prev); rows.forEach(r => n.delete(r.item.id)); return n; });
    closeReceive(); setSaving(false);
    toast.success(`تم تسجيل توريد ${rows.length} بند`);
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
  const receiveOrder = receiveOrderId !== null ? orders.find(o => o.id === receiveOrderId) : undefined;

  // قسم الشراء مايضيفش أوامر جديدة، بيسجل التوريد بس
  const newOrderButton = !canCreateOrder ? undefined : (
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
              description={isPurchaseDept ? "مفيش أوامر شراء دلوقتي." : "ابدأ بإضافة أول أمر شراء ببنوده وصور الفاتورة."}
              action={newOrderButton}
            />
          </div>
        ) : (
          <div className="eg-stagger space-y-3">
            {orders.map(order => {
              const count = order.purchase_items.length;
              const showActions = canEditOrder(order) || canReceive;
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
                      <Badge label={order.status} tone="neutral" dot={false} />
                      {order.images.map((img, i) => (
                        <a key={img.id} href={getImageUrl(img.image_path) ?? "#"} target="_blank" rel="noopener"
                          onClick={e => e.stopPropagation()}
                          className="eg-link inline-flex items-center gap-1 text-xs">
                          <ImageIcon className="size-3.5" />صورة {i + 1}
                        </a>
                      ))}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {canAddItem(order) && (
                        <button type="button" onClick={e => { e.preventDefault(); openAddItem(order.id); }}
                          className="eg-btn-ghost eg-btn-xs">
                          <Plus className="size-3" />إضافة بند
                        </button>
                      )}
                      {canEditOrder(order) && (
                        <Tooltip content="تعديل الأمر">
                          <button type="button" aria-label="تعديل أمر الشراء"
                            onClick={e => { e.preventDefault(); openEditOrder(order); }}
                            className="eg-icon-btn">
                            <Pencil className="size-3.5" />
                          </button>
                        </Tooltip>
                      )}
                      {isManager && (
                        <Tooltip content="حذف الأمر">
                          <button type="button" aria-label="حذف أمر الشراء"
                            onClick={e => { e.preventDefault(); removeOrder(order); }}
                            className="eg-icon-btn-danger">
                            <Trash2 className="size-3.5" />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </summary>

                  {canReceive && (() => {
                    const selHere = order.purchase_items.filter(it => selItems.has(it.id));
                    return selHere.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-accent/5 px-4 py-2">
                        <span className="text-xs text-text">تم تحديد <span className="font-bold tabular-nums">{selHere.length}</span> بند</span>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setSelItems(new Set())} className="eg-btn-ghost eg-btn-sm">إلغاء</button>
                          <button type="button" onClick={() => openReceive(order.id, selHere)} className="eg-btn-primary eg-btn-sm">
                            <PackageCheck className="size-3.5" />تسجيل التوريد
                          </button>
                        </div>
                      </div>
                    ) : null;
                  })()}
                  {count > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="eg-table min-w-[760px]">
                        <thead>
                          <tr>
                            {canReceive && <th className="w-10"><span className="sr-only">تحديد</span></th>}
                            <th>الصنف</th>
                            <th className="w-24">الكمية</th>
                            <th className="w-28">المستلم</th>
                            <th className="w-24">الفئة</th>
                            <th className="w-36">التوريد المتوقع</th>
                            <th className="w-36">التوريد الفعلي</th>
                            <th className="w-28">الحالة</th>
                            {showActions && <th className="w-24"><span className="sr-only">إجراءات</span></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {order.purchase_items.map(item => {
                            const late = !!item.expected_supply_date && item.expected_supply_date < todayStr && isOpenItem(item.status);
                            return (
                              <tr key={item.id}>
                                {canReceive && (
                                  <td>
                                    {isOpenItem(item.status) && (
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
                                <td className="tabular-nums text-subtext">{item.received_qty} / {item.quantity}</td>
                                <td className="text-subtext">{item.category}</td>
                                <td className={cn("tabular-nums", late ? "font-semibold text-danger" : "text-subtext")}>
                                  {item.expected_supply_date ?? "—"}
                                  {late && <span className="mr-1.5 rounded bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium">متأخر</span>}
                                </td>
                                <td className="tabular-nums text-subtext">{item.supply_date ?? "—"}</td>
                                <td><Badge label={item.status} /></td>
                                {showActions && (
                                  <td>
                                    <div className="flex items-center justify-end gap-0.5">
                                      {canReceive && isOpenItem(item.status) && (
                                        <Tooltip content="تسجيل التوريد">
                                          <button type="button" onClick={() => openReceive(order.id, [item])}
                                            className="eg-icon-btn" aria-label="تسجيل توريد البند">
                                            <PackageCheck className="size-3.5" />
                                          </button>
                                        </Tooltip>
                                      )}
                                      {canEditOrder(order) && (
                                        <Tooltip content="تعديل">
                                          <button type="button" onClick={() => openEditItem(item)}
                                            className="eg-icon-btn" aria-label="تعديل البند">
                                            <Pencil className="size-3.5" />
                                          </button>
                                        </Tooltip>
                                      )}
                                      {isManager && (
                                        <Tooltip content="حذف">
                                          <button type="button" onClick={() => removeItem(order.id, item)}
                                            className="eg-icon-btn-danger" aria-label="حذف البند">
                                            <Trash2 className="size-3.5" />
                                          </button>
                                        </Tooltip>
                                      )}
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
                      action={canAddItem(order) ? (
                        <button type="button" onClick={() => openAddItem(order.id)} className="eg-btn-ghost eg-btn-xs">
                          <Plus className="size-3" />إضافة بند
                        </button>
                      ) : undefined}
                    />
                  )}
                </details>
              );
            })}
          </div>
        )}
      </PageBody>

      {/* أمر شراء جديد + صوره + بنوده */}
      <Modal open={addOrderOpen} onClose={closeNewOrder} title="أمر شراء جديد">
        <form onSubmit={createOrder} className="space-y-5">
          <OrderFields value={newOrder} onChange={patch => setNewOrder(f => ({ ...f, ...patch }))} wos={wos} autoFocus showStatus={isManager} />

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
                <ItemFields value={item} onChange={patch => updateNewOrderItem(idx, patch)} autoFocus={idx > 0} showStatus={isManager} />
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

      {/* تعديل بيانات أمر الشراء (أمر الشغل + الصور) */}
      <Modal open={!!editOrder} onClose={() => setEditOrder(null)}
        title={editOrder?.order_no ? `تعديل الأمر #${editOrder.order_no}` : "تعديل الأمر"}>
        <form onSubmit={submitEditOrder} className="space-y-5">
          <OrderFields value={editOrderForm} onChange={patch => setEditOrderForm(f => ({ ...f, ...patch }))}
            wos={wos} currentImages={editOrder?.images ?? []} onRemoveCurrent={removeOrderImage} autoFocus />
          <button type="submit" disabled={saving} className="eg-btn-success w-full">
            {saving ? <Spinner /> : <Save className="size-4" />}
            {saving ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </form>
      </Modal>

      {/* تسجيل التوريد: كامل أو جزئي بالكمية */}
      <Modal open={receiveOrderId !== null} onClose={closeReceive} title="تسجيل التوريد"
        description={receiveOrder
          ? <>أمر الشراء <span className="font-mono">{orderLabel(receiveOrder)}</span> — اكتب الكمية اللي وصلت دلوقتي لكل بند</>
          : undefined}>
        <form onSubmit={submitReceive} className="space-y-4">
          <div className="overflow-x-auto">
            <table className="eg-table min-w-[480px]">
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th className="w-20">المطلوب</th>
                  <th className="w-24">المستلم قبل كده</th>
                  <th className="w-32">وصل دلوقتي</th>
                </tr>
              </thead>
              <tbody>
                {receiveRows.map(r => (
                  <tr key={r.item.id}>
                    <td className="font-medium text-text">{r.item.item_name}</td>
                    <td className="tabular-nums">{r.item.quantity}</td>
                    <td className="tabular-nums text-subtext">{r.item.received_qty}</td>
                    <td>
                      <input type="number" min="0" step="any" max={r.remaining}
                        aria-label={`الكمية المستلمة من ${r.item.item_name}`}
                        value={receiveQty[r.item.id] ?? ""}
                        onChange={e => setReceiveQty(prev => ({ ...prev, [r.item.id]: e.target.value }))}
                        className="eg-input tabular-nums" />
                      <p className="mt-1 text-[11px] text-subtext">
                        {r.now > 0 && r.total >= r.item.quantity ? "هيتقفل كـ تم التوريد" : r.now > 0 ? "توريد جزئي" : "المتبقي " + r.remaining}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-subtext">إجمالي الكمية المسجلة دلوقتي: <span className="font-semibold tabular-nums text-text">{receiveTotal}</span></p>
          <button type="submit" disabled={saving || receiveTotal <= 0} className="eg-btn-primary w-full">
            {saving ? <Spinner /> : <PackageCheck className="size-4" />}
            {saving ? "جاري الحفظ..." : "تسجيل التوريد"}
          </button>
        </form>
      </Modal>

      {/* إضافة بند لأمر شراء موجود */}
      <Modal open={addItemOrderId !== null} onClose={() => setAddItemOrderId(null)} title="إضافة بند"
        description={addItemOrder
          ? <>أمر الشراء <span className="font-mono">{orderLabel(addItemOrder)}</span>{addItemOrder.work_order?.wo_number && <> · <span className="font-mono">{addItemOrder.work_order.wo_number}</span></>}</>
          : undefined}>
        <form onSubmit={submitAddItem} className="space-y-5">
          <ItemFields value={addItemForm} onChange={patch => setAddItemForm(f => ({ ...f, ...patch }))} autoFocus showStatus={isManager} />
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
// عناصر نموذج بند قابلة لإعادة الاستخدام (بدون صور - الصور على الأمر)
// متعرفة برّه المكوّن الرئيسي علشان الحقول ماتتعملهاش mount من جديد مع كل حرف
// ---------------------------------------------------------------------
function ItemFields({ value, onChange, autoFocus, showStatus = true }: {
  value: ItemForm; onChange: (patch: Partial<ItemForm>) => void; autoFocus?: boolean; showStatus?: boolean;
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
      <Field label="التاريخ المتوقع للتوريد" className="col-span-2 sm:col-span-1">
        <input type="date" value={value.expected_supply_date}
          onChange={e => onChange({ expected_supply_date: e.target.value })} className="eg-input" />
      </Field>
      {showStatus && (
        <Field label="الحالة" className="col-span-2 sm:col-span-1">
          <select value={value.status} onChange={e => onChange({ status: e.target.value })} className="eg-select">
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      )}
    </div>
  );
}

// نموذج بيانات أمر الشراء نفسه: رقم الأمر + أمر الشغل + الحالة + الصور
function OrderFields({ value, onChange, wos, currentImages, onRemoveCurrent, autoFocus, showStatus = true }: {
  value: OrderForm;
  onChange: (patch: Partial<OrderForm>) => void;
  wos: WOOption[];
  currentImages?: OrderImage[];
  onRemoveCurrent?: (img: OrderImage) => void;
  autoFocus?: boolean;
  showStatus?: boolean;
}) {
  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    onChange({ images: [...value.images, ...Array.from(files)] });
  };
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
        {showStatus && (
          <Field label="حالة أمر الشراء">
            <select value={value.status} onChange={e => onChange({ status: e.target.value })} className="eg-select">
              {ORDER_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
        )}
      </div>
      <Field label="صور الفاتورة / أمر الشراء (صورة واحدة على الأقل)">
        <div className="space-y-2">
          {(currentImages ?? []).map((img, i) => (
            <div key={img.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card2/40 px-3 py-2">
              <a href={getImageUrl(img.image_path) ?? "#"} target="_blank" rel="noopener"
                className="eg-link inline-flex items-center gap-1 text-xs">
                <ExternalLink className="size-3" />صورة {i + 1}
              </a>
              {onRemoveCurrent && (
                <button type="button" onClick={() => onRemoveCurrent(img)} className="eg-btn-danger-soft eg-btn-xs">
                  <Trash2 className="size-3" />حذف
                </button>
              )}
            </div>
          ))}
          <label className={cn(
            "eg-btn-ghost eg-btn-sm max-w-full cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/60",
            value.images.length > 0 && "border-accent/40 text-accent",
          )}>
            <ImageIcon className="size-3.5 shrink-0" />
            <span>{value.images.length > 0 ? `إضافة صور (${value.images.length} مختارة)` : "اختر صور"}</span>
            <input type="file" accept="image/*" multiple className="sr-only"
              onChange={e => { addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {value.images.length > 0 && (
            <ul className="space-y-1">
              {value.images.map((f, idx) => (
                <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2 text-xs text-subtext">
                  <span className="min-w-0 truncate">{f.name}</span>
                  <button type="button"
                    onClick={() => onChange({ images: value.images.filter((_, i) => i !== idx) })}
                    className="eg-icon-btn-danger" aria-label={`إزالة ${f.name}`}>
                    <Trash2 className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>
    </div>
  );
}
