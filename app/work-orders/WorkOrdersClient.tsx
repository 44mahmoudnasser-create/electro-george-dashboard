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
              <tr key={w.id} className="cursor-pointer" onClick={() => setDetailWO(w)}>
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
          </div>
        )}
      </Modal>
    </div>
  );
}
