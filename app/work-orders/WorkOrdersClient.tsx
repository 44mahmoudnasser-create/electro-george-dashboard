"use client";
import { useState, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
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

export default function WorkOrdersClient({ initialWOs, role }: {
  initialWOs: WorkOrder[]; role: string;
}) {
  const router = useRouter();
  const pathname = usePathname(); // مسار صفحة القائمة نفسها، بنبني منه رابط صفحة التفاصيل: {pathname}/{id}
  const [wos, setWOs] = useState<WorkOrder[]>(initialWOs);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [filterPriority, setFilterPriority] = useState("الكل");
  const [sortCol, setSortCol] = useState<keyof WorkOrder>("id");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [addOpen, setAddOpen] = useState(false);
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
  }, [wos, search, filterStatus, filterPriority, sortCol, sortDir]);

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
    router.push(`${pathname}/${data.id}`); // يوديك على طول لصفحة التفاصيل الكاملة بعد الإنشاء
  };

  const openDetail = (w: WorkOrder) => router.push(`${pathname}/${w.id}`);

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
              <tr key={w.id} className="cursor-pointer hover:bg-card2 transition-colors" onClick={() => openDetail(w)}>
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
    </div>
  );
}
