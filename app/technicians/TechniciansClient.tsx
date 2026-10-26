"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { deptLabel, initials } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { Technician } from "@/types";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Field, { FormError } from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import { Page, PageHeader, PageBody } from "@/components/ui/Page";
import { SearchInput } from "@/components/ui/Filters";
import { useToast } from "@/components/ui/Toast";
import { Plus, ChevronLeft, Users, UserPlus } from "lucide-react";

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
  const toast = useToast();
  const [techs, setTechs] = useState<TechRow[]>(initialTechnicians);
  const [search, setSearch] = useState("");
  const [filterGrade, setFilterGrade] = useState("الكل");
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // المدير مش مرتبط بقسم، فبيختار قسم الفني
  const [formDept, setFormDept] = useState("");
  const deptEffective = role === "manager" ? formDept : (department ?? "");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", grade: "فني" as typeof GRADES[number], route: "", skill_ids: [] as number[],
  });

  const filtered = useMemo(() => techs.filter(t =>
    (!search || t.name.includes(search) || (t.route ?? "").includes(search)) &&
    (filterGrade === "الكل" || t.grade === filterGrade)
  ), [techs, search, filterGrade]);

  const filtersActive = !!search || filterGrade !== "الكل";
  const clearFilters = () => { setSearch(""); setFilterGrade("الكل"); };

  const skillNames = (t: TechRow) =>
    (t.tech_skills ?? []).map(ts => ts.skills?.skill_name).filter(Boolean) as string[];

  const toggleSkill = (id: number) =>
    setForm(f => ({
      ...f,
      skill_ids: f.skill_ids.includes(id) ? f.skill_ids.filter(x => x !== id) : [...f.skill_ids, id],
    }));

  const resetForm = () => setForm({ name: "", grade: "فني", route: "", skill_ids: [] });
  const closeAdd = () => { setAddOpen(false); resetForm(); setError(""); };

  const addTech = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.name.trim() || !deptEffective || saving) return;
    setSaving(true); setError("");
    const { data, error: e1 } = await supabase
      .from("technicians")
      .insert({ name: form.name.trim(), grade: form.grade, route: form.route, department: deptEffective })
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
    toast.success(`تمت إضافة ${data.name ?? "الفني"}`);
  };

  return (
    <Page width="5xl">
      <PageHeader
        title="الفنيين"
        icon={Users}
        subtitle={<span className="tabular-nums">{filtersActive ? `${filtered.length} من ${techs.length} فني` : `${techs.length} فني`}</span>}
        actions={<>
          <SearchInput value={search} onChange={setSearch} placeholder="بحث بالاسم أو خط السير" className="w-full sm:w-56" />
          <select value={filterGrade} onChange={e => setFilterGrade(e.target.value)}
            aria-label="الدرجة" className="eg-select eg-input-sm w-28">
            <option value="الكل">كل الدرجات</option>
            {GRADES.map(g => <option key={g}>{g}</option>)}
          </select>
          <button onClick={() => setAddOpen(true)} className="eg-btn-primary eg-btn-sm">
            <Plus className="size-3.5" />إضافة فني
          </button>
        </>}
      />

      <PageBody>
        <div className="eg-card overflow-hidden !p-0">
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="eg-table min-w-[480px]">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th className="w-40">خط السير</th>
                    <th className="w-24">الدرجة</th>
                    <th className="hidden md:table-cell">المهارات</th>
                    <th className="w-10"><span className="sr-only">فتح</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(t => {
                    const skills = skillNames(t);
                    const href = `/technicians/${t.id}`;
                    return (
                      <tr key={t.id} onClick={() => router.push(href)} className="group cursor-pointer">
                        <td>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span aria-hidden
                              className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-accent ring-1 ring-inset ring-accent/25">
                              {initials(t.name)}
                            </span>
                            <Link href={href} onClick={e => e.stopPropagation()}
                              className="min-w-0 max-w-[240px] truncate font-medium text-text underline-offset-4 transition-colors hover:text-accent hover:underline">
                              {t.name}
                            </Link>
                          </div>
                        </td>
                        <td className="text-xs text-subtext">{t.route || "—"}</td>
                        <td><Badge label={t.grade ?? "فني"} /></td>
                        <td className="hidden md:table-cell">
                          <span className="block max-w-[320px] truncate text-xs text-subtext" title={skills.length ? skills.join("، ") : undefined}>
                            {skills.length ? skills.join("، ") : "—"}
                          </span>
                        </td>
                        <td className="text-muted transition-colors group-hover:text-accent">
                          <ChevronLeft className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Users}
              message={techs.length ? "مفيش فنيين مطابقين للبحث" : "لا يوجد فنيين"}
              description={techs.length ? "غيّر الدرجة أو امسح البحث علشان تشوف باقي الفنيين." : "ابدأ بإضافة أول فني."}
              action={techs.length > 0 && filtersActive
                ? <button onClick={clearFilters} className="eg-btn-ghost eg-btn-sm">مسح الفلاتر</button>
                : techs.length === 0
                  ? <button onClick={() => setAddOpen(true)} className="eg-btn-primary eg-btn-sm"><Plus className="size-3.5" />إضافة فني</button>
                  : undefined}
            />
          )}
        </div>
      </PageBody>

      {/* مودال الإضافة */}
      <Modal open={addOpen} onClose={closeAdd} title="إضافة فني جديد" size="md">
        <form onSubmit={addTech} className="space-y-4">
          <Field label="الاسم" required>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="eg-input" placeholder="اسم الفني" autoFocus />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="الدرجة الوظيفية">
              <select value={form.grade}
                onChange={e => setForm(f => ({ ...f, grade: e.target.value as typeof GRADES[number] }))}
                className="eg-select">
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="خط السير">
              <input value={form.route} onChange={e => setForm(f => ({ ...f, route: e.target.value }))}
                className="eg-input" placeholder="مثال: كرداسة" />
            </Field>
          </div>
          {role === "manager" && (
            <Field label="القسم" required>
              <select value={formDept} onChange={e => setFormDept(e.target.value)} className="eg-select">
                <option value="">— اختار القسم —</option>
                {["SHEET", "PAINT", "ASSEMBLY"].map(d => <option key={d} value={d}>{deptLabel(d)}</option>)}
              </select>
            </Field>
          )}
          <Field label={<SkillsLabel count={form.skill_ids.length} />}>
            <SkillChecklist skills={allSkills} selected={form.skill_ids} onToggle={toggleSkill} />
          </Field>
          <FormError>{error}</FormError>
          <button type="submit" disabled={saving || !form.name.trim() || !deptEffective} className="eg-btn-primary w-full">
            {saving ? <Spinner /> : <UserPlus className="size-4" />}
            {saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </form>
      </Modal>
    </Page>
  );
}

/* ═══════════════════════ مكونات صغيرة ═══════════════════════ */

// عنوان المهارات مع عدد المختار
function SkillsLabel({ count }: { count: number }) {
  return (
    <>
      المهارات
      {count > 0 && (
        <span className="mr-1.5 rounded-full bg-accent/15 px-1.5 text-[11px] font-semibold tabular-nums text-accent">{count}</span>
      )}
    </>
  );
}

// اختيار المهارات ككروت checkbox
function SkillChecklist({ skills, selected, onToggle }: {
  skills: Skill[]; selected: number[]; onToggle: (id: number) => void;
}) {
  if (skills.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border/70 px-3 py-4 text-center text-xs text-subtext">
        لا توجد مهارات — أضفها أولاً من تبويب المهارات
      </p>
    );
  }
  return (
    <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-2">
      {skills.map(s => {
        const on = selected.includes(s.id);
        return (
          <label key={s.id} className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm text-text transition-colors duration-150",
            on ? "border-accent/50 bg-accent/10" : "border-border/60 bg-card2/50 hover:border-border-strong",
          )}>
            <input type="checkbox" checked={on} onChange={() => onToggle(s.id)} className="shrink-0" />
            <span className="min-w-0 truncate">{s.skill_name}</span>
          </label>
        );
      })}
    </div>
  );
}
