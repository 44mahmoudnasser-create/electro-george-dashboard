"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Pencil, Trash2, Save } from "lucide-react";

type Tech = { id: number; name: string; grade: string };
type Skill = {
  id: number; skill_name: string;
  tech_skills: { tech_id: number; technicians: Tech | null }[];
};

export default function SkillsClient({ initialSkills, role }: { initialSkills: Skill[]; role: string }) {
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [addOpen, setAddOpen]   = useState(false);
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [newName, setNewName]   = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving]     = useState(false);

  const addSkill = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const { data, error } = await supabase.from("skills").insert({ skill_name: name }).select().single();
    setSaving(false);
    if (error) { alert(error.message === "duplicate key value violates unique constraint \"skills_skill_name_key\"" ? "المهارة موجودة مسبقاً" : error.message); return; }
    setSkills(prev => [...prev, { ...data, tech_skills: [] }].sort((a,b) => a.skill_name.localeCompare(b.skill_name)));
    setNewName(""); setAddOpen(false);
  };

  const saveEdit = async () => {
    if (!editSkill || !editName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("skills").update({ skill_name: editName.trim() }).eq("id", editSkill.id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    setSkills(prev => prev.map(s => s.id === editSkill.id ? { ...s, skill_name: editName.trim() } : s));
    setEditSkill(null);
  };

  const deleteSkill = async (skill: Skill) => {
    if (!confirm(`حذف مهارة "${skill.skill_name}"؟ سيتم إلغاء ربطها بالفنيين.`)) return;
    await supabase.from("tech_skills").delete().eq("skill_id", skill.id);
    await supabase.from("skills").delete().eq("id", skill.id);
    setSkills(prev => prev.filter(s => s.id !== skill.id));
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text">🔧 المهارات</h1>
        {true && (
          <button onClick={() => setAddOpen(true)} className="eg-btn-primary">
            <Plus className="w-4 h-4" />إضافة مهارة
          </button>
        )}
      </div>

      {skills.length === 0 && <EmptyState message="لا توجد مهارات مسجلة بعد" />}

      <div className="space-y-3">
        {skills.map(skill => {
          const techs = skill.tech_skills.map(ts => ts.technicians).filter(Boolean) as Tech[];
          return (
            <div key={skill.id} className="eg-card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex gap-2">
                  {true && <>
                    <button onClick={() => { setEditSkill(skill); setEditName(skill.skill_name); }}
                      className="text-subtext hover:text-accent transition-colors p-1">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteSkill(skill)}
                      className="text-subtext hover:text-danger transition-colors p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-subtext bg-card2 px-2 py-0.5 rounded-full">
                    {techs.length} فني
                  </span>
                  <h2 className="font-bold text-text text-base">🔹 {skill.skill_name}</h2>
                </div>
              </div>

              {techs.length > 0 ? (
                <div className="flex flex-wrap gap-2 justify-end">
                  {techs.map(t => (
                    <button key={t.id}
                      onClick={() => router.push(`/technicians/${t.id}`)}
                      className="bg-card2 hover:bg-border/50 text-text text-xs font-medium
                                 px-3 py-1.5 rounded-full border border-border/50
                                 hover:border-accent/40 transition-all cursor-pointer">
                      {t.name}
                      <span className="text-subtext mr-1">({t.grade})</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-subtext text-right">لا يوجد فنيين بهذه المهارة بعد</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); setNewName(""); }} title="إضافة مهارة جديدة" size="sm">
        <div className="space-y-4">
          <div>
            <label className="eg-label">اسم المهارة</label>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addSkill()}
              className="eg-input" placeholder="مثال: لحام كهربي" autoFocus />
          </div>
          <button onClick={addSkill} disabled={saving} className="eg-btn-primary w-full justify-center">
            {saving ? "جاري الحفظ..." : "💾 حفظ"}
          </button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editSkill} onClose={() => setEditSkill(null)} title="تعديل المهارة" size="sm">
        <div className="space-y-4">
          <div>
            <label className="eg-label">اسم المهارة</label>
            <input value={editName} onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && saveEdit()}
              className="eg-input" autoFocus />
          </div>
          <button onClick={saveEdit} disabled={saving} className="eg-btn-success w-full justify-center">
            <Save className="w-4 h-4" />{saving ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
