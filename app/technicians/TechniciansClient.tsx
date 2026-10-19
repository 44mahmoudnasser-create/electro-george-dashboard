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
  initialTechnicians, allSkills, role, department,
}: {
  initialTechnicians: TechRow[];
  allSkills: Skill[];
  role: string;
  department: string | null;
}) {
  const router = useRouter();
  const [techs, setTechs] = useState<TechRow[]>(initialTechnicians);
  const [search, setSearch] = useState("");
  const [filterGrade, setFilterGrade] = useState("الكل");
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", grade: "فني" as typeof GRADES[number], route: "", skill_ids: [] as number[],
  });

  const filtered = useMemo(() => techs.filter(t =>
    (!search || t.name.includes(search) || (t.route ?? "").includes(search)) &&
    (filterGrade === "الكل" || t.grade === filterGrade)
  ), [techs, search, filterGrade]);

  const skillNames = (t: TechRow) =>
    (t.tech_skills ?? []).map(ts => ts.skills?.skill_name).filter(Boolean) as string[];

  const toggleSkill = (id: number) =>
    setForm(f => ({
      ...f,
      skill_ids: f.skill_ids.includes(id) ? f.skill_ids.filter(x => x !== id) : [...f.skill_ids, id],
    }));

  const resetForm = () => setForm({ name: "", grade: "فني", route: "", skill_ids: [] });

  const addTech = async () => {
    if (!form.name.trim()) return;
    setSaving(true); setError("");
    const { data, error: e1 } = await supabase
      .from("technicians")
      .insert({ name: form.name.trim(), grade: form.grade, route: form.route, department })
      .select()
      .single();
    if (e1) { setSaving(false); setError(e1.message); return; }

    if (form.skill_ids.length > 0) {
      const { error: e2 } = await supabase.from("tech_skills").insert(
        form.skill_ids.map(skill_id => ({ tech_id: data.id, skill_id }))
      );
      if (e2) { setSaving(false); setError(e2.message); return; }
    }
    const skills = allSkills.filter(s => form.skill_ids.includes(s.id));
    setTechs(prev => [{
      ...data,
      tech_skills: skills.map(s => ({ skill_id: s.id, skills: { skill_name: s.skill_name } })),
    }, ...prev]);
    setAddOpen(false); resetForm(); setSaving(false);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* شريط علوي ثابت */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border/60 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-text">الفنيين</h1>
            <span className="text-xs text-subtext tabular-nums">{filtered.length} / {techs.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtext" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="eg-input !py-1.5 !text-xs pr-8 w-44" placeholder="بحث بالاسم أو خط السير" />
            </div>
            <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)}
              className="eg-select !py-1.5 !text-xs w-28">
              <option>الكل</option>
              {GRADES.map(g => <option key={g}>{g}</option>)}
            </select>
            <button onClick={() => setAddOpen(true)} className="eg-btn-primary !py-1.5 !text-xs">
              <Plus className="w-3.5 h-3.5" />إضافة فني
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6">
        <div className="eg-card !p-0 overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-card2 text-subtext text-xs">
                <th className="px-4 py-2 text-right font-semibold">الاسم</th>
                <th className="px-3 py-2 text-right font-semibold w-40">خط السير</th>
                <th className="px-3 py-2 text-right font-semibold w-24">الدرجة</th>
                <th className="px-3 py-2 text-right font-semibold hidden md:table-cell">المهارات</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const skills = skillNames(t);
                return (
                  <tr key={t.id} onClick={() => router.push(`/technicians/${t.id}`)}
                    className="border-t border-border/40 cursor-pointer hover:bg-card2/50 group">
                    <td className="px-4 py-2 font-medium text-text">{t.name}</td>
                    <td className="px-3 py-2 text-xs text-subtext">{t.route ?? "—"}</td>
                    <td className="px-3 py-2"><Badge label={t.grade ?? "فني"} /></td>
                    <td className="px-3 py-2 text-xs text-subtext hidden md:table-cell">
                      <span className="line-clamp-1">{skills.length ? skills.join("، ") : "—"}</span>
                    </td>
                    <td className="px-3 py-2 text-subtext group-hover:text-accent">
                      <ChevronLeft className="w-4 h-4" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState message="لا يوجد فنيين" />}
        </div>
      </div>

      {/* مودال الإضافة */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); resetForm(); setError(""); }}
        title="إضافة فني جديد" size="md">
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
                  <input type="checkbox" checked={form.skill_ids.includes(s.id)}
                    onChange={() => toggleSkill(s.id)} className="accent-emerald-500 w-4 h-4" />
                  {s.skill_name}
                </label>
              ))}
              {allSkills.length === 0 && (
                <p className="text-xs text-subtext col-span-2">لا توجد مهارات — أضفها أولاً من تبويب المهارات</p>
              )}
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={addTech} disabled={saving || !form.name.trim()} className="eg-btn-primary w-full justify-center">
            {saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
