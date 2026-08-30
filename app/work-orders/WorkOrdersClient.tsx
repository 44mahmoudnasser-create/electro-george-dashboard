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

export default function WorkOrdersClient({ initialWOs, role }: { initialWOs: WorkOrder[]; role: string }) {
  const [wos, setWOs] = useState<WorkOrder[]>(initialWOs);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [sortCol, setSortCol] = useState<keyof WorkOrder>("id");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [addOpen, setAddOpen] = useState(false);
  const [detailWO, setDetailWO] = useState<WorkOrder|null>(null);
  const [form, setForm] = useState({ wo_number:"", status:"لم يبدأ", expected_delivery:"" });
  const [saving, setSaving] = useState(false);
  const todayStr = today();

  const sorted = useMemo(() => {
    let list = wos.filter(w =>
      (!search || w.wo_number.includes(search)) &&
      (filterStatus === "الكل" || w.status === filterStatus)
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
    setForm({ wo_number:"", status:"لم يبدأ", expected_delivery:"" });
  };

  const updateWO = async (id:number, patch: Partial<WorkOrder>) => {
    const auto: Partial<WorkOrder> = {};
    if (patch.status === "مكتمل" && !detailWO?.completion_date) auto.completion_date = todayStr;
    await supabase.from("work_orders").update({ ...patch, ...auto }).eq("id", id);
    setWOs(prev => prev.map(w => w.id === id ? { ...w, ...patch, ...auto } : w));
    setDetailWO(prev => prev ? { ...prev, ...patch, ...auto } : prev);
  };
// 1. حالات جديدة لتخزين البيانات والتبويبات
  const [activeTab, setActiveTab] = useState<"prod"|"files"|"purchases">("prod");
  const [relatedData, setRelatedData] = useState({ productivity: [] as any[], files: [] as any[], purchases: [] as any[] });
  const [loadingDetails, setLoadingDetails] = useState(false);

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

    const [ { data: prod }, { data: files }, { data: pur } ] = await Promise.all([
      supabase.from("daily_productivity").select("work_date, task, notes, technicians(name)").eq("wo_id", w.id).order("work_date", { ascending: false }),
      supabase.from("files").select("file_name, file_type, receive_date, delivery_date, technicians(name)").eq("wo_id", w.id),
      supabase.from("purchases").select("item_name, qty, request_date, supply_date, status, image_path").eq("wo_id", w.id)
    ]);

    setRelatedData({
      productivity: (prod ?? []).map((p: any) => ({ ...p, tech_name: p.technicians?.name })),
      files: (files ?? []).map((f: any) => ({ ...f, supervisor_name: f.technicians?.name })),
      purchases: pur ?? []
    });
    
    setLoadingDetails(false);
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
      </div>

      {/* Table */}
      <div className="eg-card overflow-x-auto">
        <table className="eg-table">
          <thead><tr>
            <Th col="wo_number" label="رقم الأمر" />
            <Th col="status" label="الحالة" />
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
