"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Trash2, Search } from "lucide-react";
import { today } from "@/lib/utils";

type Violation = {
  id: number; tech_id: number; date?: string; reason?: string; details?: string;
  technician?: { id: number; name: string };
};

export default function ViolationsClient({
  initialViolations, technicians, role,
}: {
  initialViolations: Violation[];
  technicians: { id: number; name: string }[];
  role: string;
}) {
  const router = useRouter();
  const [violations, setViolations] = useState<Violation[]>(initialViolations);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tech_id: "", date: today(), reason: "", details: "" });

  const filtered = violations.filter(v =>
    !search ||
    (v.technician?.name ?? "").includes(search) ||
    (v.reason ?? "").includes(search)
  );

  const addViolation = async () => {
    if (!form.tech_id || !form.reason.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from("violations").insert({
      tech_id: parseInt(form.tech_id),
      date: form.date || today(),
      reason: form.reason,
      details: form.details,
    }).select("*, technician:technicians(id, name)").single();
    setSaving(false);
    if (error) { alert(error.message); return; }
    setViolations(prev => [data, ...prev]);
    setAddOpen(false);
    setForm({ tech_id: "", date: today(), reason: "", details: "" });
  };

  const deleteViolation = async (id: number) => {
    if (!confirm("حذف هذه المخالفة؟")) return;
    await supabase.from("violations").delete().eq("id", id);
    setViolations(prev => prev.filter(v => v.id !== id));
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text">⚠️ المخالفات</h1>
        {true && (
          <button onClick={() => setAddOpen(true)} className="eg-btn-danger">
            <Plus className="w-4 h-4" />تسجيل مخالفة
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "إجمالي المخالفات", value: violations.length, color: "text-danger" },
          { label: "هذا الشهر", value: violations.filter(v => v.date?.startsWith(today().slice(0,7))).length, color: "text-warning" },
          { label: "فنيين متكررين", value: new Set(violations.map(v => v.tech_id)).size, color: "text-subtext" },
        ].map(s => (
          <div key={s.label} className="eg-card text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-subtext mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative w-56">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="eg-input pr-9" placeholder="بحث بالاسم أو السبب" />
      </div>

      {/* Table */}
      <div className="eg-card overflow-x-auto">
        <table className="eg-table">
          <thead>
            <tr>
              <th>الفني</th><th>التاريخ</th><th>السبب</th><th>التفاصيل</th>
              {true && <th></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(v => (
              <tr key={v.id}>
                <td>
                  <button
                    onClick={() => router.push(`/technicians/${v.technician?.id}`)}
                    className="text-accent hover:underline font-medium text-sm">
                    {v.technician?.name ?? "—"}
                  </button>
                </td>
                <td className="text-subtext">{v.date ?? "—"}</td>
                <td className="text-text">{v.reason ?? "—"}</td>
                <td className="text-subtext">{v.details ?? "—"}</td>
                {true && (
                  <td>
                    <button onClick={() => deleteViolation(v.id)}
                      className="text-danger/50 hover:text-danger transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState message="لا توجد مخالفات" />}
      </div>

      {/* Add Modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="تسجيل مخالفة جديدة">
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
              <label className="eg-label">التاريخ</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="eg-input" />
            </div>
          </div>
          <div>
            <label className="eg-label">السبب *</label>
            <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="eg-input" placeholder="مثال: تأخر عن العمل" />
          </div>
          <div>
            <label className="eg-label">التفاصيل</label>
            <textarea value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
              className="eg-input resize-none" rows={3} placeholder="تفاصيل إضافية..." />
          </div>
          <button onClick={addViolation} disabled={saving} className="eg-btn-danger w-full justify-center">
            {saving ? "جاري الحفظ..." : "⚠️ تسجيل المخالفة"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
