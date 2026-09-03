"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { ChevronRight, Save } from "lucide-react";
import { today } from "@/lib/utils";

const STATUSES = ["لم يبدأ","جاري","متوقف","مكتمل","تم التسليم"];
const PRIORITIES = ["منخفضة","متوسطة","عالية","عاجلة"];

export default function WODetailClient({ wo, productivity, files, purchases, products, initialWoProducts, role }: {
  wo: any; productivity: any[]; files: any[]; purchases: any[];
  products: { id:number; name:string }[]; initialWoProducts: any[]; role: string;
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
  const [activeTab, setActiveTab] = useState<"prod"|"files"|"purchases"|"products">("prod");
  const todayStr = today();

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
              <input type="month" value={planMonth} onChange={e => setPlanMonth(e.target.value)} className="eg-input" />
            </div>
          </div>

          {/* Checklist */}
          <div className="bg-card2 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-text">✅ قائمة التحقق</p>
            {CHECKLIST.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox"
                  checked={checks[key]}
                  onChange={e => setChecks(c => ({ ...c, [key]: e.target.checked }))}
                  className="w-5 h-5 accent-emerald-500 cursor-pointer" />
                <span className="text-sm text-text">{label}</span>
                {checks[key] && <span className="text-success text-xs">✓ تم</span>}
              </label>
            ))}
          </div>

          {/* Info row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            {[
              ["تاريخ الإتمام", wo.completion_date ?? "—"],
              ["التسليم المتوقع", wo.expected_delivery ?? "—"],
            ].map(([l, v]) => (
              <div key={l} className="bg-card2 rounded-lg p-3">
                <p className="text-subtext text-xs mb-1">{l}</p>
                <p className={`font-medium ${v !== "—" && wo.expected_delivery && wo.expected_delivery < todayStr && !["مكتمل","تم التسليم"].includes(status) ? "text-danger" : "text-text"}`}>{v}</p>
              </div>
            ))}
          </div>

          <button onClick={save} disabled={saving} className="eg-btn-success w-full justify-center">
            <Save className="w-4 h-4" />{saving ? "جاري الحفظ..." : "💾 حفظ التعديلات"}
          </button>
        </div>
      )}

      {/* Readonly checklist for secretary */}
      {role !== "admin" && (
        <div className="eg-card">
          <p className="text-sm font-semibold text-text mb-3">✅ قائمة التحقق</p>
          {CHECKLIST.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-3 py-2 border-b border-border/30 last:border-0">
              <span>{checks[key] ? "✅" : "⬜"}</span>
              <span className="text-sm text-text">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(({ key, label }) => (
          <button key={key}
            onClick={() => setActiveTab(key as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all
              ${activeTab === key ? "bg-accent text-white" : "bg-card2 text-subtext hover:text-text"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="eg-card overflow-x-auto">
        {activeTab === "prod" && (
          productivity.length ? (
            <table className="eg-table">
              <thead><tr><th>الفني</th><th>التاريخ</th><th>المهمة</th><th>ملاحظات</th></tr></thead>
              <tbody>{productivity.map((p, i) => (
                <tr key={i}>
                  <td className="text-text font-medium">{p.tech_name ?? "—"}</td>
                  <td className="text-subtext">{p.work_date}</td>
                  <td className="text-text">{p.task}</td>
                  <td className="text-subtext">{p.notes ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <EmptyState message="لا توجد سجلات إنتاجية لهذا الأمر" />
        )}

        {activeTab === "files" && (
          files.length ? (
            <table className="eg-table">
              <thead><tr><th>الملف</th><th>النوع</th><th>استلام</th><th>سُلِّم لـ</th><th>تاريخ التسليم</th></tr></thead>
              <tbody>{files.map((f, i) => (
                <tr key={i}>
                  <td className="text-text">{f.file_name}</td>
                  <td className="text-subtext">{f.file_type ?? "—"}</td>
                  <td className="text-subtext">{f.receive_date ?? "—"}</td>
                  <td className="text-text">{f.supervisor_name ?? "—"}</td>
                  <td className="text-subtext">{f.delivery_date ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <EmptyState message="لا توجد ملفات" />
        )}

        {activeTab === "purchases" && (
          purchases.length ? (
            <table className="eg-table">
              <thead><tr><th>الصنف</th><th>الكمية</th><th>طلب</th><th>توريد</th><th>الحالة</th><th>صورة</th></tr></thead>
              <tbody>{purchases.map((p: any, i) => (
                <tr key={i}>
                  <td className="text-text">{p.item_name}</td>
                  <td>{p.qty}</td>
                  <td className="text-subtext">{p.request_date ?? "—"}</td>
                  <td className={p.supply_date && p.supply_date < todayStr && p.status === "مفتوح" ? "text-danger font-medium" : "text-subtext"}>
                    {p.supply_date ?? "—"}
                  </td>
                  <td><Badge label={p.status} /></td>
                  <td>
                    {p.image_path ? (
                      <a href={getImageUrl(p.image_path)} target="_blank" rel="noopener"
                        className="text-accent text-xs hover:underline">عرض</a>
                    ) : <span className="text-subtext text-xs">—</span>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          ) : <EmptyState message="لا توجد طلبات شراء" />
        )}

        {activeTab === "products" && (
          <div className="space-y-4">
            {role === "admin" && (
              <div className="flex flex-wrap items-end gap-2 bg-card2 rounded-lg p-3">
                <div className="flex-1 min-w-[160px]">
                  <label className="eg-label">المنتج القياسي</label>
                  <select value={addProductId} onChange={e=>setAddProductId(e.target.value)} className="eg-select">
                    <option value="">— اختر منتج —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="w-24">
                  <label className="eg-label">الكمية</label>
                  <input type="number" min="0.01" step="any" value={addProductQty}
                    onChange={e=>setAddProductQty(e.target.value)} className="eg-input" />
                </div>
                <button onClick={addProduct} disabled={savingProduct || !addProductId} className="eg-btn-primary">
                  {savingProduct ? "جاري الإضافة..." : "إضافة"}
                </button>
              </div>
            )}
            {woProducts.length ? (
              <table className="eg-table">
                <thead><tr><th>المنتج</th><th>الكمية</th>{role === "admin" && <th>إجراءات</th>}</tr></thead>
                <tbody>{woProducts.map((wp:any) => (
                  <tr key={wp.id}>
                    <td className="text-text font-medium">{wp.standard_product?.name ?? "—"}</td>
                    <td>{wp.quantity}</td>
                    {role === "admin" && (
                      <td><button onClick={() => removeProduct(wp.id)} className="text-danger/60 hover:text-danger text-xs hover:underline">حذف</button></td>
                    )}
                  </tr>
                ))}</tbody>
              </table>
            ) : <EmptyState message="لا توجد منتجات مربوطة بهذا الأمر بعد" />}
          </div>
        )}
      </div>
    </div>
  );
}
