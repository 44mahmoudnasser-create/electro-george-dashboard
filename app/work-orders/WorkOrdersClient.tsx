"use client";
import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { WorkOrder } from "@/types";
import { today } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Search, ArrowUpDown } from "lucide-react";

const STATUSES = ["لم يبدأ","جاري","متوقف","مكتمل","تم التسليم"];
const PRIORITIES = ["منخفضة","متوسطة","عالية","عاجلة"];
const PRIORITY_COLORS: Record<string,string> = {
  "منخفضة":"text-subtext", "متوسطة":"text-accent", "عالية":"text-warning", "عاجلة":"text-danger",
};

export default function WorkOrdersClient({ initialWOs, products, role }: {
  initialWOs: WorkOrder[]; products: { id:number; name:string }[]; role: string;
}) {
  const [wos, setWOs] = useState<WorkOrder[]>(initialWOs);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [filterPriority, setFilterPriority] = useState("الكل");
  const [sortCol, setSortCol] = useState<keyof WorkOrder>("id");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [addOpen, setAddOpen] = useState(false);
  const [detailWO, setDetailWO] = useState<WorkOrder|null>(null);
  const [form, setForm] = useState({ wo_number:"", status:"لم يبدأ", expected_delivery:"", priority:"متوسطة", plan_month:"" });
  const [saving, setSaving] = useState(false);
  const todayStr = today();

  const sorted = useMemo(() => {
    let list = wos.filter(w =>
      (!search || w.wo_number.includes(search)) &&
      (filterStatus === "الكل" || w.status === filterStatus) &&
      (filterPriority === "الكل" || (w as any).priority === filterPriority)
    );
    list = [...list].sort((a,b) => {
      const av = String(a[sortCol] ?? ""); const bv = String(b[sortCol] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list;
  }, [wos, search, filterStatus, sortCol, sortDir]);

  const toggleSort = (col: keyof WorkOrder) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const Th = ({ col, label }: { col: keyof WorkOrder; label: string }) => (
    <th className="cursor-pointer select-none" onClick={() => toggleSort(col)}>
      <div className="flex items-center gap-1 justify-end">
        {label}<ArrowUpDown className="w-3 h-3 opacity-50" />
      </div>
    </th>
  );

  const addWO = async () => {
    if (!form.wo_number.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from("work_orders")
      .insert({ ...form, created_date: todayStr }).select().single();
    setSaving(false);
    if (error) { alert(error.message); return; }
    setWOs(prev => [data, ...prev]);
    setAddOpen(false);
    setForm({ wo_number:"", status:"لم يبدأ", expected_delivery:"", priority:"متوسطة", plan_month:"" });
  };

  const updateWO = async (id:number, patch: Partial<WorkOrder>) => {
    const auto: Partial<WorkOrder> = {};
    if (patch.status === "مكتمل" && !detailWO?.completion_date) auto.completion_date = todayStr;
    await supabase.from("work_orders").update({ ...patch, ...auto }).eq("id", id);
    setWOs(prev => prev.map(w => w.id === id ? { ...w, ...patch, ...auto } : w));
    setDetailWO(prev => prev ? { ...prev, ...patch, ...auto } : prev);
  };
// 1. حالات جديدة لتخزين البيانات والتبويبات
  const [activeTab, setActiveTab] = useState<"prod"|"files"|"purchases"|"products">("prod");
  const [relatedData, setRelatedData] = useState({ productivity: [] as any[], files: [] as any[], purchases: [] as any[], wo_products: [] as any[] });
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [addProductId, setAddProductId] = useState("");
  const [addProductQty, setAddProductQty] = useState("1");
  const [savingProduct, setSavingProduct] = useState(false);

  // 2. دالة لجلب الصورة
  const getImageUrl = (path: string) => {
    if (!path) return "";
    const { data } = supabase.storage.from("purchases").getPublicUrl(path);
    return data.publicUrl;
  };

  // 3. دالة تفتح الـ Modal وتجلب البيانات الخاصة بأمر الشغل
  const openDetailModal = async (w: WorkOrder) => {
    setDetailWO(w);
    setActiveTab("prod");
    setLoadingDetails(true);

    const [ { data: prod }, { data: files }, { data: pur }, { data: woProducts } ] = await Promise.all([
      supabase.from("daily_productivity").select("work_date, task, notes, technicians(name)").eq("wo_id", w.id).order("work_date", { ascending: false }),
      supabase.from("files").select("file_name, file_type, receive_date, delivery_date, technicians(name)").eq("wo_id", w.id),
      supabase.from("purchases").select("item_name, qty, request_date, supply_date, status, image_path").eq("wo_id", w.id),
      supabase.from("work_order_products").select("id, quantity, standard_product:standard_products(id,name)").eq("work_order_id", w.id),
    ]);

    setRelatedData({
      productivity: (prod ?? []).map((p: any) => ({ ...p, tech_name: p.technicians?.name })),
      files: (files ?? []).map((f: any) => ({ ...f, supervisor_name: f.technicians?.name })),
      purchases: pur ?? [],
      wo_products: woProducts ?? [],
    });
    
    setLoadingDetails(false);
  };

  // 4. إضافة/حذف منتج قياسي مربوط بأمر الشغل
  const addProductToWO = async () => {
    if (!detailWO || !addProductId) return;
    setSavingProduct(true);
    const { data, error } = await supabase.from("work_order_products")
      .insert({ work_order_id: detailWO.id, standard_product_id: parseInt(addProductId), quantity: parseFloat(addProductQty) || 1 })
      .select("id, quantity, standard_product:standard_products(id,name)")
      .single();
    setSavingProduct(false);
    if (error) { alert(error.message); return; }
    setRelatedData(prev => ({ ...prev, wo_products: [...prev.wo_products, data] }));
    setAddProductId(""); setAddProductQty("1");
  };

  const removeProductFromWO = async (linkId: number) => {
    if (!confirm("حذف هذا المنتج من الأوردر؟")) return;
    await supabase.from("work_order_products").delete().eq("id", linkId);
    setRelatedData(prev => ({ ...prev, wo_products: prev.wo_products.filter((p:any) => p.id !== linkId) }));
  };
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text">📋 أوامر الشغل</h1>
        {true && (
          <button onClick={() => setAddOpen(true)} className="eg-btn-primary">
            <Plus className="w-4 h-4" />إضافة أمر شغل
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
          <input value={search} onChange={e=>setSearch(e.target.value)}
            className="eg-input pr-9 w-48" placeholder="بحث برقم الأمر" />
        </div>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} className="eg-select w-40">
          <option>الكل</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={e=>setFilterPriority(e.target.value)} className="eg-select w-40">
          <option>الكل</option>
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="eg-card overflow-x-auto">
        <table className="eg-table">
          <thead><tr>
            <Th col="wo_number" label="رقم الأمر" />
            <Th col="status" label="الحالة" />
            <th>الأولوية</th>
            <th>شهر الخطة</th>
            <Th col="created_date" label="الإنشاء" />
            <Th col="expected_delivery" label="التسليم المتوقع" />
            <Th col="completion_date" label="تاريخ الإتمام" />
            <th>قائمة التحقق</th>
          </tr></thead>
          <tbody>
            {sorted.map(w => (
          <tr key={w.id} className="cursor-pointer hover:bg-card2 transition-colors" onClick={() => openDetailModal(w)}>
                  <td className="font-mono text-accent font-semibold">{w.wo_number}</td>
                <td><Badge label={w.status} /></td>
                <td className={`font-medium ${PRIORITY_COLORS[(w as any).priority] ?? "text-subtext"}`}>{(w as any).priority ?? "—"}</td>
                <td className="text-subtext">{(w as any).plan_month ?? "—"}</td>
                <td className="text-subtext">{w.created_date ?? "—"}</td>
                <td className={
                  w.expected_delivery && w.expected_delivery < todayStr &&
                  !["مكتمل","تم التسليم"].includes(w.status)
                    ? "text-danger font-medium" : "text-subtext"
                }>{w.expected_delivery ?? "—"}</td>
                <td className="text-subtext">{w.completion_date ?? "—"}</td>
                <td className="text-center space-x-1">
                  {w.chk_client?"✅":"⬜"} {w.chk_quality?"✅":"⬜"} {w.chk_assembly?"✅":"⬜"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && <EmptyState />}
      </div>

      {/* Add Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة أمر شغل جديد">
        <div className="space-y-4">
          <div><label className="eg-label">رقم أمر الشغل</label>
            <input value={form.wo_number} onChange={e=>setForm(f=>({...f,wo_number:e.target.value}))}
              className="eg-input" placeholder="مثال: WO-2026-001" /></div>
          <div><label className="eg-label">الحالة</label>
            <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="eg-select">
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select></div>
          <div><label className="eg-label">تاريخ التسليم المتوقع</label>
            <input type="date" value={form.expected_delivery}
              onChange={e=>setForm(f=>({...f,expected_delivery:e.target.value}))}
              className="eg-input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="eg-label">الأولوية</label>
              <select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))} className="eg-select">
                {PRIORITIES.map(p=><option key={p}>{p}</option>)}
              </select></div>
            <div><label className="eg-label">شهر الخطة</label>
              <input type="month" value={form.plan_month}
                onChange={e=>setForm(f=>({...f,plan_month:e.target.value}))}
                className="eg-input" /></div>
          </div>
          <button onClick={addWO} disabled={saving} className="eg-btn-primary w-full justify-center">
            {saving ? "جاري الحفظ..." : "💾 حفظ"}
          </button>
        </div>
      </Modal>
{/* Detail / Edit Modal */}
      <Modal open={!!detailWO} onClose={() => setDetailWO(null)} title={`أمر الشغل: ${detailWO?.wo_number}`} size="lg">
        {detailWO && (
          <div className="space-y-5">
            {/* Status + delivery */}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="eg-label">الحالة</label>
                <select value={detailWO.status}
                  onChange={e => updateWO(detailWO.id, { status: e.target.value })}
                  className="eg-select" disabled={role !== "admin"}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select></div>
              <div><label className="eg-label">التسليم المتوقع</label>
                <input type="date" value={detailWO.expected_delivery ?? ""}
                  onChange={e => updateWO(detailWO.id, { expected_delivery: e.target.value })}
                  className="eg-input" disabled={role !== "admin"} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="eg-label">الأولوية</label>
                <select value={(detailWO as any).priority ?? "متوسطة"}
                  onChange={e => updateWO(detailWO.id, { priority: e.target.value } as Partial<WorkOrder>)}
                  className="eg-select" disabled={role !== "admin"}>
                  {PRIORITIES.map(p=><option key={p}>{p}</option>)}
                </select></div>
              <div><label className="eg-label">شهر الخطة</label>
                <input type="month" value={(detailWO as any).plan_month ?? ""}
                  onChange={e => updateWO(detailWO.id, { plan_month: e.target.value } as Partial<WorkOrder>)}
                  className="eg-input" disabled={role !== "admin"} /></div>
            </div>
            {/* Info */}
            <div className="bg-card2 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
              {[["الإنشاء", detailWO.created_date],["الإتمام", detailWO.completion_date ?? "—"]].map(([l,v])=>(
                <div key={l}><p className="text-subtext text-xs">{l}</p><p className="text-text font-medium">{v}</p></div>
              ))}
            </div>
            
            {/* Checklist */}
            {true && (
              <div className="bg-card2 rounded-lg p-4 space-y-3">
                <p className="text-sm font-semibold text-text mb-2">✅ قائمة التحقق</p>
                {[
                  { key:"chk_client",   label:"استلمه العميل" },
                  { key:"chk_quality",  label:"استلمه قسم الجودة" },
                  { key:"chk_assembly", label:"تم الانتهاء من التجميع الكهربي" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox"
                      checked={!!detailWO[key as keyof WorkOrder]}
                      onChange={e => updateWO(detailWO.id, { [key]: e.target.checked } as Partial<WorkOrder>)}
                      className="w-5 h-5 accent-emerald-500 cursor-pointer" />
                    <span className="text-sm text-text">{label}</span>
                  </label>
                ))}
              </div>
            )}

            {/* --- بداية التبويبات الجديدة (تأكدنا إنها جوه الـ Modal) --- */}
            {loadingDetails ? (
              <div className="text-center py-4 text-subtext text-sm">جاري جلب التفاصيل...</div>
            ) : (
              <div className="space-y-4 pt-4 border-t border-border/50">
                {/* أزرار التبويبات */}
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {[
                    { key: "prod", label: `الإنتاجية (${relatedData.productivity?.length || 0})` },
                    { key: "files", label: `الملفات (${relatedData.files?.length || 0})` },
                    { key: "purchases", label: `المشتريات (${relatedData.purchases?.length || 0})` },
                    { key: "products", label: `المنتجات (${relatedData.wo_products?.length || 0})` },
                  ].map(({ key, label }) => (
                    <button key={key} type="button"
                      onClick={() => setActiveTab(key as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all
                        ${activeTab === key ? "bg-accent text-white" : "bg-card2 text-subtext hover:text-text"}`}>
                      {label}
                    </button>
                  ))}
                </div>

                {/* محتوى التبويبات */}
                <div className="eg-card overflow-x-auto">
                  {/* جدول الإنتاجية */}
                  {activeTab === "prod" && (
                    relatedData.productivity?.length ? (
                      <table className="eg-table">
                        <thead><tr><th>الفني</th><th>التاريخ</th><th>المهمة</th><th>ملاحظات</th></tr></thead>
                        <tbody>{relatedData.productivity.map((p, i) => (
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

                  {/* جدول الملفات */}
                  {activeTab === "files" && (
                    relatedData.files?.length ? (
                      <table className="eg-table">
                        <thead><tr><th>الملف</th><th>النوع</th><th>استلام</th><th>سُلِّم لـ</th><th>تاريخ التسليم</th></tr></thead>
                        <tbody>{relatedData.files.map((f, i) => (
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

                  {/* جدول المشتريات */}
                  {activeTab === "purchases" && (
                    relatedData.purchases?.length ? (
                      <table className="eg-table">
                        <thead><tr><th>الصنف</th><th>الكمية</th><th>طلب</th><th>توريد</th><th>الحالة</th><th>صورة</th></tr></thead>
                        <tbody>{relatedData.purchases.map((p, i) => (
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
                                <a href={getImageUrl(p.image_path)} target="_blank" rel="noopener noreferrer"
                                  className="text-accent text-xs hover:underline">عرض</a>
                              ) : <span className="text-subtext text-xs">—</span>}
                            </td>
                          </tr>
                        ))}</tbody>
                      </table>
                    ) : <EmptyState message="لا توجد طلبات شراء" />
                  )}

                  {/* المنتجات القياسية المربوطة بالأوردر */}
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
                          <button onClick={addProductToWO} disabled={savingProduct || !addProductId}
                            className="eg-btn-primary">
                            {savingProduct ? "جاري الإضافة..." : "إضافة"}
                          </button>
                        </div>
                      )}
                      {relatedData.wo_products?.length ? (
                        <table className="eg-table">
                          <thead><tr><th>المنتج</th><th>الكمية</th>{role === "admin" && <th>إجراءات</th>}</tr></thead>
                          <tbody>{relatedData.wo_products.map((wp:any) => (
                            <tr key={wp.id}>
                              <td className="text-text font-medium">{wp.standard_product?.name ?? "—"}</td>
                              <td>{wp.quantity}</td>
                              {role === "admin" && (
                                <td>
                                  <button onClick={() => removeProductFromWO(wp.id)}
                                    className="text-danger/60 hover:text-danger text-xs hover:underline">حذف</button>
                                </td>
                              )}
                            </tr>
                          ))}</tbody>
                        </table>
                      ) : <EmptyState message="لا توجد منتجات مربوطة بهذا الأمر بعد" />}
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* --- نهاية التبويبات --- */}
          </div>
        )}
      </Modal>
    </div>
  );
}
