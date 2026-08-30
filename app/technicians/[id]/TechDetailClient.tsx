"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { ChevronRight, Pencil, Trash2, Save } from "lucide-react";

const GRADES = ["فني", "مشرف", "مساعد"] as const;

export default function TechDetailClient({
  tech, allSkills, techSkills,
  attendance, permissions, overtime, violations, productivity, filesReceived, role,
}: {
  tech: any; allSkills: any[]; techSkills: { skill_id: number; skill_name?: string }[];
  attendance: any[]; permissions: any[]; overtime: any[];
  violations: any[]; productivity: any[]; filesReceived: any[];
  role: string;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const [form, setForm] = useState({
    name: tech.name, grade: tech.grade, route: tech.route ?? "",
    skill_ids: techSkills.map(ts => ts.skill_id),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<"info"|"att"|"perm"|"ot"|"viol"|"prod"|"files">("info");

  const toggleSkill = (id: number) =>
    setForm(f => ({
      ...f,
      skill_ids: f.skill_ids.includes(id) ? f.skill_ids.filter(x => x !== id) : [...f.skill_ids, id],
    }));

  const saveEdit = async () => {
    setSaving(true);
    await supabase.from("technicians")
      .update({ name: form.name, grade: form.grade, route: form.route })
      .eq("id", tech.id);
    await supabase.from("tech_skills").delete().eq("tech_id", tech.id);
    if (form.skill_ids.length > 0) {
      await supabase.from("tech_skills").insert(
        form.skill_ids.map(skill_id => ({ tech_id: tech.id, skill_id }))
      );
    }
    setSaving(false); setEditOpen(false);
    router.refresh();
  };

  const deleteTech = async () => {
    setDeleting(true);
    for (const t of ["tech_skills","violations","attendance","permissions","overtime","daily_productivity"]) {
      await supabase.from(t).delete().eq("tech_id", tech.id);
    }
    await supabase.from("files").update({ delivered_to: null }).eq("delivered_to", tech.id);
    await supabase.from("technicians").delete().eq("id", tech.id);
    router.push("/technicians");
  };

  const TABS = [
    { key: "info",  label: "البيانات" },
    { key: "att",   label: `الحضور (${attendance.length})` },
    { key: "perm",  label: `الإذونات (${permissions.length})` },
    { key: "ot",    label: `سهر (${overtime.length})` },
    { key: "viol",  label: `مخالفات (${violations.length})` },
    { key: "prod",  label: `إنتاجية (${productivity.length})` },
    { key: "files", label: `ملفات (${filesReceived.length})` },
  ] as const;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => router.back()}
          className="eg-btn-ghost text-sm px-3 py-2">
          <ChevronRight className="w-4 h-4" /> الفنيين
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-text">{tech.name}</h1>
          <p className="text-sm text-subtext">{tech.route ?? "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge label={tech.grade} />
          {true && <>
            <button onClick={() => setEditOpen(true)} className="eg-btn-ghost px-3 py-2">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => setDelConfirm(true)} className="eg-btn-danger px-3 py-2">
              <Trash2 className="w-4 h-4" />
            </button>
          </>}
        </div>
      </div>

      {/* Skills pills */}
      {techSkills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {techSkills.map(ts => (
            <span key={ts.skill_id}
              className="bg-accent/10 text-accent text-xs font-medium px-3 py-1 rounded-full border border-accent/20">
              🔧 {ts.skill_name}
            </span>
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
      <div className="eg-card">
        {activeTab === "info" && (
          <div className="space-y-3">
            {[["الاسم", tech.name], ["الدرجة", tech.grade], ["خط السير", tech.route ?? "—"]].map(([l, v]) => (
              <div key={l} className="flex items-center justify-between border-b border-border/30 pb-3">
                <span className="text-text font-medium">{v}</span>
                <span className="text-subtext text-sm">{l}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === "att" && (
          attendance.length ? (
            <table className="eg-table">
              <thead><tr><th>التاريخ</th><th>الحالة</th></tr></thead>
              <tbody>{attendance.map((a, i) => (
                <tr key={i}><td className="text-subtext">{a.date}</td><td><Badge label={a.status} /></td></tr>
              ))}</tbody>
            </table>
          ) : <EmptyState message="لا توجد سجلات حضور" />
        )}

        {activeTab === "perm" && (
          permissions.length ? (
            <table className="eg-table">
              <thead><tr><th>التاريخ</th><th>نوع الإذن</th></tr></thead>
              <tbody>{permissions.map((p, i) => (
                <tr key={i}><td className="text-subtext">{p.date}</td><td className="text-text">{p.permission_type}</td></tr>
              ))}</tbody>
            </table>
          ) : <EmptyState message="لا توجد إذونات" />
        )}

        {activeTab === "ot" && (
          overtime.length ? (
            <table className="eg-table">
              <thead><tr><th>تاريخ السهر / العمل الإضافي</th></tr></thead>
              <tbody>{overtime.map((o, i) => (
                <tr key={i}><td className="text-subtext">{o.date}</td></tr>
              ))}</tbody>
            </table>
          ) : <EmptyState message="لا يوجد سجل عمل إضافي" />
        )}

        {activeTab === "viol" && (
          violations.length ? (
            <table className="eg-table">
              <thead><tr><th>التاريخ</th><th>السبب</th><th>التفاصيل</th></tr></thead>
              <tbody>{violations.map((v, i) => (
                <tr key={i}>
                  <td className="text-subtext">{v.date}</td>
                  <td className="text-text">{v.reason}</td>
                  <td className="text-subtext">{v.details}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <EmptyState message="لا توجد مخالفات" />
        )}

        {activeTab === "prod" && (
          productivity.length ? (
            <table className="eg-table">
              <thead><tr><th>التاريخ</th><th>أمر الشغل</th><th>المهمة</th><th>ملاحظات</th></tr></thead>
              <tbody>{productivity.map((p, i) => (
                <tr key={i}>
                  <td className="text-subtext">{p.work_date}</td>
                  <td className="font-mono text-accent text-sm">{p.wo_number ?? "—"}</td>
                  <td className="text-text">{p.task}</td>
                  <td className="text-subtext">{p.notes ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <EmptyState message="لا توجد سجلات إنتاجية" />
        )}

        {activeTab === "files" && (
          filesReceived.length ? (
            <table className="eg-table">
              <thead><tr><th>الملف</th><th>النوع</th><th>أمر الشغل</th><th>تاريخ الاستلام</th></tr></thead>
              <tbody>{filesReceived.map((f, i) => (
                <tr key={i}>
                  <td className="text-text">{f.file_name}</td>
                  <td className="text-subtext">{f.file_type ?? "—"}</td>
                  <td className="font-mono text-accent text-sm">{f.wo_number ?? "—"}</td>
                  <td className="text-subtext">{f.delivery_date ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <EmptyState message="لا توجد ملفات مستلمة" />
        )}
      </div>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="تعديل بيانات الفني">
        <div className="space-y-4">
          <div>
            <label className="eg-label">الاسم</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="eg-input" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eg-label">الدرجة</label>
              <select value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))} className="eg-select">
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="eg-label">خط السير</label>
              <input value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))} className="eg-input" />
            </div>
          </div>
          <div>
            <label className="eg-label">المهارات</label>
            <div className="bg-card2 rounded-lg p-3 max-h-40 overflow-y-auto grid grid-cols-2 gap-2">
              {allSkills.map(s => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm text-text">
                  <input type="checkbox" checked={form.skill_ids.includes(s.id)}
                    onChange={() => toggleSkill(s.id)} className="accent-emerald-500 w-4 h-4" />
                  {s.skill_name}
                </label>
              ))}
            </div>
          </div>
          <button onClick={saveEdit} disabled={saving} className="eg-btn-success w-full justify-center">
            <Save className="w-4 h-4" />{saving ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal open={delConfirm} onClose={() => setDelConfirm(false)} title="تأكيد الحذف" size="sm">
        <p className="text-text text-sm mb-5 text-right">
          هل أنت متأكد من حذف الفني <strong>{tech.name}</strong>؟
          <br /><span className="text-danger text-xs">سيتم حذف جميع بياناته (حضور، مخالفات، إنتاجية)</span>
        </p>
        <div className="flex gap-3">
          <button onClick={() => setDelConfirm(false)} className="eg-btn-ghost flex-1 justify-center">إلغاء</button>
          <button onClick={deleteTech} disabled={deleting} className="eg-btn-danger flex-1 justify-center">
            <Trash2 className="w-4 h-4" />{deleting ? "جاري الحذف..." : "نعم، احذف"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
