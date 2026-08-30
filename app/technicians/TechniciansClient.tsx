"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Technician } from "@/types";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Search, ChevronLeft } from "lucide-react";

type TechRow = Technician & {
  tech_skills?: { skill_id: number; skills: { skill_name: string } | null }[];
};
type Skill = { id: number; skill_name: string };

const GRADES = ["فني", "مشرف", "مساعد"] as const;

export default function TechniciansClient({
  initialTechnicians, allSkills, role,
}: {
  initialTechnicians: TechRow[];
  allSkills: Skill[];
  role: string;
}) {
  const router = useRouter();
  const [techs, setTechs] = useState<TechRow[]>(initialTechnicians);
  const [search, setSearch] = useState("");
  const [filterGrade, setFilterGrade] = useState("الكل");
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", grade: "فني" as typeof GRADES[number], route: "",
    skill_ids: [] as number[],
  });

  const filtered = useMemo(() =>
    techs.filter(t =>
      (!search || t.name.includes(search) || (t.route ?? "").includes(search)) &&
      (filterGrade === "الكل" || t.grade === filterGrade)
    ), [techs, search, filterGrade]);

  const toggleSkill = (id: number) =>
    setForm(f => ({
      ...f,
      skill_ids: f.skill_ids.includes(id)
        ? f.skill_ids.filter(x => x !== id)
        : [...f.skill_ids, id],
    }));

  const resetForm = () =>
    setForm({ name: "", grade: "فني", route: "", skill_ids: [] });

  const addTech = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("technicians")
      .insert({ name: form.name, grade: form.grade, route: form.route })
      .select()
      .single();
    if (error) { alert(error.message); setSaving(false); return; }

    if (form.skill_ids.length > 0) {
      await supabase.from("tech_skills").insert(
        form.skill_ids.map(skill_id => ({ tech_id: data.id, skill_id }))
      );
    }
    const skills = allSkills.filter(s => form.skill_ids.includes(s.id));
    setTechs(prev => [{
      ...data,
      tech_skills: skills.map(s => ({ skill_id: s.id, skills: { skill_name: s.skill_name } })),
    }, ...prev]);
    setAddOpen(false); resetForm(); setSaving(false);
  };

  const getSkillNames = (t: TechRow) =>
    (t.tech_skills ?? []).map(ts => ts.skills?.skill_name).filter(Boolean).join("، ");

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text">👷 الفنيين</h1>
        {true && (
          <button onClick={() => setAddOpen(true)} className="eg-btn-primary">
            <Plus className="w-4 h-4" />إضافة فني
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="eg-input pr-9 w-48" placeholder="بحث بالاسم أو خط السير" />
        </div>
        <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)} className="eg-select w-36">
          <option>الكل</option>
          {GRADES.map(g => <option key={g}>{g}</option>)}
        </select>
      </div>

      {/* Grid of cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(t => (
          <button key={t.id}
            onClick={() => router.push(`/technicians/${t.id}`)}
            className="eg-card text-right hover:border-accent/40 transition-all cursor-pointer group">
            <div className="flex items-start justify-between mb-3">
              <ChevronLeft className="w-4 h-4 text-subtext group-hover:text-accent transition-colors mt-1" />
              <div>
                <p className="font-bold text-text text-base">{t.name}</p>
                <p className="text-xs text-subtext mt-0.5">{t.route ?? "—"}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 flex-wrap">
              <Badge label={t.grade ?? "فني"} />
            </div>
            {getSkillNames(t) && (
              <p className="text-xs text-subtext mt-2 line-clamp-1 text-right">
                🔧 {getSkillNames(t)}
              </p>
            )}
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-3"><EmptyState message="لا يوجد فنيين" /></div>
        )}
      </div>

      {/* Add Modal */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); resetForm(); }} title="إضافة فني جديد" size="md">
        <div className="space-y-4">
          <div>
            <label className="eg-label">الاسم *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="eg-input" placeholder="اسم الفني" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eg-label">الدرجة الوظيفية</label>
              <select value={form.grade}
                onChange={e => setForm(f => ({ ...f, grade: e.target.value as typeof GRADES[number] }))}
                className="eg-select">
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="eg-label">خط السير</label>
              <input value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))}
                className="eg-input" placeholder="مثال: كرداسة" />
            </div>
          </div>
          <div>
            <label className="eg-label">المهارات</label>
            <div className="bg-card2 rounded-lg p-3 max-h-40 overflow-y-auto grid grid-cols-2 gap-2">
              {allSkills.map(s => (
                <label key={s.id} className="flex items-center gap-2 cursor-pointer text-sm text-text">
                  <input type="checkbox"
                    checked={form.skill_ids.includes(s.id)}
                    onChange={() => toggleSkill(s.id)}
                    className="accent-emerald-500 w-4 h-4" />
                  {s.skill_name}
                </label>
              ))}
              {allSkills.length === 0 && (
                <p className="text-xs text-subtext col-span-2">لا توجد مهارات — أضفها أولاً من تبويب المهارات</p>
              )}
            </div>
          </div>
          <button onClick={addTech} disabled={saving} className="eg-btn-primary w-full justify-center">
            {saving ? "جاري الحفظ..." : "💾 حفظ"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
