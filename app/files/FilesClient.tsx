"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Send, Search } from "lucide-react";
import { today } from "@/lib/utils";

type FileRow = {
  id: number; wo_id?: number; file_name: string; file_type?: string;
  receive_date?: string; delivered_to?: number; delivery_date?: string;
  work_order?: { wo_number: string }; supervisor?: { name: string };
};

const FILE_TYPES = ["إضافة","تعديل","أمر الشغل نفسه"];

export default function FilesClient({
  initialFiles, wos, supervisors, role,
}: {
  initialFiles: FileRow[];
  wos: { id: number; wo_number: string }[];
  supervisors: { id: number; name: string }[];
  role: string;
}) {
  const [files, setFiles] = useState<FileRow[]>(initialFiles);
  const [search, setSearch] = useState("");
  const [recvOpen, setRecvOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recvForm, setRecvForm] = useState({ wo_id: "", file_name: "", file_type: FILE_TYPES[0], receive_date: today() });
  const [deliverForm, setDeliverForm] = useState({ file_id: "", supervisor_id: "", delivery_date: today() });

  const pending = files.filter(f => !f.delivered_to);
  const filtered = files.filter(f =>
    !search || f.file_name.toLowerCase().includes(search.toLowerCase()) ||
    (f.work_order?.wo_number ?? "").includes(search)
  );

  const recvFile = async () => {
    if (!recvForm.file_name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from("files").insert({
      wo_id: recvForm.wo_id ? parseInt(recvForm.wo_id) : null,
      file_name: recvForm.file_name,
      file_type: recvForm.file_type,
      receive_date: recvForm.receive_date || today(),
    }).select(`*, work_order:work_orders(wo_number), supervisor:technicians(name)`).single();
    setSaving(false);
    if (error) { alert(error.message); return; }
    setFiles(prev => [data, ...prev]);
    setRecvOpen(false);
    setRecvForm({ wo_id: "", file_name: "", file_type: FILE_TYPES[0], receive_date: today() });
  };

  const deliverFile = async () => {
    if (!deliverForm.file_id || !deliverForm.supervisor_id) return;
    setSaving(true);
    const fileId = parseInt(deliverForm.file_id);
    const supId  = parseInt(deliverForm.supervisor_id);
    const { error } = await supabase.from("files").update({
      delivered_to: supId,
      delivery_date: deliverForm.delivery_date || today(),
    }).eq("id", fileId);
    setSaving(false);
    if (error) { alert(error.message); return; }
    const sup = supervisors.find(s => s.id === supId);
    setFiles(prev => prev.map(f => f.id === fileId
      ? { ...f, delivered_to: supId, delivery_date: deliverForm.delivery_date, supervisor: sup ? { name: sup.name } : undefined }
      : f
    ));
    setDeliverOpen(false);
    setDeliverForm({ file_id: "", supervisor_id: "", delivery_date: today() });
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text">📁 الملفات</h1>
        {true && (
          <div className="flex gap-2">
            <button onClick={() => setRecvOpen(true)} className="eg-btn-primary">
              <Plus className="w-4 h-4" />استلام ملف
            </button>
            <button onClick={() => setDeliverOpen(true)} className="eg-btn-ghost">
              <Send className="w-4 h-4" />تسليم ملف
            </button>
          </div>
        )}
      </div>

      {/* Pending delivery banner */}
      {pending.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl px-4 py-3 flex items-center justify-between">
          <button onClick={() => setDeliverOpen(true)} className="text-warning text-xs hover:underline">
            تسليم الآن ←
          </button>
          <p className="text-warning text-sm font-medium">
            {pending.length} ملف لم يُسلَّم بعد
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative w-56">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className="eg-input pr-9" placeholder="بحث باسم الملف أو الأمر" />
      </div>

      {/* Table */}
      <div className="eg-card overflow-x-auto">
        <table className="eg-table">
          <thead>
            <tr>
              <th>اسم الملف</th><th>النوع</th><th>أمر الشغل</th>
              <th>تاريخ الاستلام</th><th>سُلِّم لـ</th><th>تاريخ التسليم</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.id}>
                <td className="font-medium text-text">{f.file_name}</td>
                <td>{f.file_type ? <Badge label={f.file_type} /> : "—"}</td>
                <td className="font-mono text-accent text-sm">{f.work_order?.wo_number ?? "—"}</td>
                <td className="text-subtext">{f.receive_date ?? "—"}</td>
                <td className="text-text">{f.supervisor?.name ?? <span className="text-warning text-xs">لم يُسلَّم</span>}</td>
                <td className="text-subtext">{f.delivery_date ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState message="لا توجد ملفات" />}
      </div>

      {/* Receive Modal */}
      <Modal open={recvOpen} onClose={() => setRecvOpen(false)} title="📥 تسجيل استلام ملف">
        <div className="space-y-4">
          <div>
            <label className="eg-label">أمر الشغل (اختياري)</label>
            <select value={recvForm.wo_id} onChange={e => setRecvForm(f => ({ ...f, wo_id: e.target.value }))} className="eg-select">
              <option value="">— بدون أمر شغل —</option>
              {wos.map(w => <option key={w.id} value={w.id}>{w.wo_number}</option>)}
            </select>
          </div>
          <div>
            <label className="eg-label">اسم الملف *</label>
            <input value={recvForm.file_name} onChange={e => setRecvForm(f => ({ ...f, file_name: e.target.value }))}
              className="eg-input" placeholder="مثال: مخطط كهربي - WO2026" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eg-label">نوع الملف</label>
              <select value={recvForm.file_type} onChange={e => setRecvForm(f => ({ ...f, file_type: e.target.value }))} className="eg-select">
                {FILE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="eg-label">تاريخ الاستلام</label>
              <input type="date" value={recvForm.receive_date} onChange={e => setRecvForm(f => ({ ...f, receive_date: e.target.value }))} className="eg-input" />
            </div>
          </div>
          <button onClick={recvFile} disabled={saving} className="eg-btn-primary w-full justify-center">
            {saving ? "جاري الحفظ..." : "📥 تسجيل الاستلام"}
          </button>
        </div>
      </Modal>

      {/* Deliver Modal */}
      <Modal open={deliverOpen} onClose={() => setDeliverOpen(false)} title="📤 تسليم ملف لمشرف">
        <div className="space-y-4">
          <div>
            <label className="eg-label">الملف *</label>
            <select value={deliverForm.file_id} onChange={e => setDeliverForm(f => ({ ...f, file_id: e.target.value }))} className="eg-select">
              <option value="">اختر ملف...</option>
              {pending.map(f => <option key={f.id} value={f.id}>{f.file_name}</option>)}
            </select>
            {pending.length === 0 && <p className="text-xs text-subtext mt-1">لا توجد ملفات معلقة</p>}
          </div>
          <div>
            <label className="eg-label">المشرف المستلم *</label>
            <select value={deliverForm.supervisor_id} onChange={e => setDeliverForm(f => ({ ...f, supervisor_id: e.target.value }))} className="eg-select">
              <option value="">اختر مشرف...</option>
              {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {supervisors.length === 0 && <p className="text-xs text-warning mt-1">لا يوجد مشرفين — أضف فنيين بدرجة "مشرف" أولاً</p>}
          </div>
          <div>
            <label className="eg-label">تاريخ التسليم</label>
            <input type="date" value={deliverForm.delivery_date} onChange={e => setDeliverForm(f => ({ ...f, delivery_date: e.target.value }))} className="eg-input" />
          </div>
          <button onClick={deliverFile} disabled={saving || !deliverForm.file_id || !deliverForm.supervisor_id}
            className="eg-btn-success w-full justify-center">
            {saving ? "جاري الحفظ..." : "📤 تسجيل التسليم"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
