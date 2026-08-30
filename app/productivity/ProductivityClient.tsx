"use client";
import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Trash2, Search } from "lucide-react";
import { today } from "@/lib/utils";

type Record_ = {
  id: number; tech_id: number; wo_id?: number; work_date: string; task: string; notes?: string;
  technician?: { id: number; name: string };
  work_order?: { id: number; wo_number: string };
};

export default function ProductivityClient({
  initialRecords, technicians, wos, role,
}: {
  initialRecords: Record_[];
  technicians: { id: number; name: string }[];
  wos: { id: number; wo_number: string }[];
  role: string;
}) {
  const [records, setRecords] = useState<Record_[]>(initialRecords);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState(today());
  const [filterWO, setFilterWO] = useState("");
  const [form, setForm] = useState({
    tech_id: "", wo_id: "", work_date: today(), task: "", notes: "",
  });

  const filtered = useMemo(() => records.filter(r => {
    const matchDate = !filterDate || r.work_date === filterDate;
    const matchWO   = !filterWO   || String(r.wo_id) === filterWO;
    const matchSearch = !search ||
      (r.technician?.name ?? "").includes(search) ||
      r.task.includes(search) ||
      (r.work_order?.wo_number ?? "").includes(search);
    return matchDate && matchWO && matchSearch;
  }), [records, filterDate, filterWO, search]);

  const addRecord = async () => {
    if (!form.tech_id || !form.task.trim()) return;
    setSaving(true);
    const payload = {
      tech_id: parseInt(form.tech_id),
      wo_id: form.wo_id ? parseInt(form.wo_id) : null,
      work_date: form.work_date || today(),
      task: form.task,
      notes: form.notes || null,
    };
    const { data, error } = await supabase.from("daily_productivity")
      .insert(payload)
      .select("*, technician:technicians(id,name), work_order:work_orders(id,wo_number)")
      .single();
    setSaving(false);
    if (error) { alert(error.message); return; }
    setRecords(prev => [data, ...prev]);
    setAddOpen(false);
    setForm({ tech_id: "", wo_id: "", work_date: today(), task: "", notes: "" });
  };

  const deleteRecord = async (id: number) => {
    if (!confirm("حذف هذا السجل؟")) return;
    await supabase.from("daily_productivity").delete().eq("id", id);
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text">📊 الإنتاجية اليومية</h1>
        {true && (
          <button onClick={() => setAddOpen(true)} className="eg-btn-primary">
            <Plus className="w-4 h-4" />تسجيل مهمة
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="eg-card text-center">
          <p className="text-2xl font-bold text-accent">{filtered.length}</p>
          <p className="text-xs text-subtext mt-1">مهام في الفلتر الحالي</p>
        </div>
        <div className="eg-card text-center">
          <p className="text-2xl font-bold text-accent2">
            {new Set(filtered.map(r => r.tech_id)).size}
          </p>
          <p className="text-xs text-subtext mt-1">فنيين عملوا</p>
        </div>
        <div className="eg-card text-center">
          <p className="text-2xl font-bold text-success">
            {new Set(filtered.map(r => r.wo_id).filter(Boolean)).size}
          </p>
          <p className="text-xs text-subtext mt-1">أوامر شغل مُنجزة</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="eg-input pr-9 w-44" placeholder="بحث..." />
        </div>
        <input type="date" value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="eg-input w-44" />
        <select value={filterWO} onChange={e => setFilterWO(e.target.value)} className="eg-select w-44">
          <option value="">كل أوامر الشغل</option>
          {wos.map(w => <option key={w.id} value={w.id}>{w.wo_number}</option>)}
        </select>
        <button onClick={() => { setFilterDate(""); setFilterWO(""); setSearch(""); }}
          className="eg-btn-ghost text-xs px-3">
          مسح الفلتر
        </button>
      </div>

      {/* Table */}
      <div className="eg-card overflow-x-auto">
        <table className="eg-table">
          <thead>
            <tr>
              <th>الفني</th><th>أمر الشغل</th><th>التاريخ</th>
              <th>المهمة</th><th>ملاحظات</th>
              {true && <th></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="font-medium text-text">{r.technician?.name ?? "—"}</td>
                <td className="font-mono text-accent text-sm">{r.work_order?.wo_number ?? "—"}</td>
                <td className="text-subtext">{r.work_date}</td>
                <td className="text-text">{r.task}</td>
                <td className="text-subtext">{r.notes ?? "—"}</td>
                {true && (
                  <td>
                    <button onClick={() => deleteRecord(r.id)}
                      className="text-danger/50 hover:text-danger transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState message="لا توجد سجلات إنتاجية" />}
      </div>

      {/* Add Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="تسجيل مهمة إنتاجية">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eg-label">الفني *</label>
              <select value={form.tech_id} onChange={e => setForm(f => ({ ...f, tech_id: e.target.value }))} className="eg-select">
                <option value="">اختر فني...</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="eg-label">أمر الشغل</label>
              <select value={form.wo_id} onChange={e => setForm(f => ({ ...f, wo_id: e.target.value }))} className="eg-select">
                <option value="">— بدون أمر شغل —</option>
                {wos.map(w => <option key={w.id} value={w.id}>{w.wo_number}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="eg-label">التاريخ</label>
            <input type="date" value={form.work_date} onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))} className="eg-input" />
          </div>
          <div>
            <label className="eg-label">المهمة *</label>
            <input value={form.task} onChange={e => setForm(f => ({ ...f, task: e.target.value }))}
              className="eg-input" placeholder="مثال: تجميع لوحة رئيسية WO1978" />
          </div>
          <div>
            <label className="eg-label">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="eg-input resize-none" rows={2} placeholder="ملاحظات إضافية..." />
          </div>
          <button onClick={addRecord} disabled={saving} className="eg-btn-primary w-full justify-center">
            {saving ? "جاري الحفظ..." : "📊 تسجيل المهمة"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
