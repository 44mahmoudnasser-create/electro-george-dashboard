"use client";
import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Field, { FormError } from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import Tooltip from "@/components/ui/Tooltip";
import { Page, PageHeader, PageBody } from "@/components/ui/Page";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Plus, Pencil, Trash2, Save, Wrench } from "lucide-react";

type Tech = { id: number; name: string; grade: string };
type Skill = {
  id: number;
  skill_name: string;
  // التعديل هنا: غيرنا Tech | null لتصبح Tech[]
  tech_skills: { tech_id: number; technicians: Tech[] }[];
};

// اسم المهارة متكرر (unique constraint) → رسالة عربي واضحة
const skillErrorMessage = (message: string) =>
  message === "duplicate key value violates unique constraint \"skills_skill_name_key\"" ? "المهارة موجودة مسبقاً" : message;

export default function SkillsClient({ initialSkills, role }: { initialSkills: Skill[]; role: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [addOpen, setAddOpen]   = useState(false);
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [newName, setNewName]   = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  const closeAdd = () => { setAddOpen(false); setNewName(""); setError(""); };
  const closeEdit = () => { setEditSkill(null); setError(""); };

  const addSkill = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = newName.trim();
    if (!name || saving) return;
    setSaving(true); setError("");
    const { data, error } = await supabase.from("skills").insert({ skill_name: name }).select().single();
    setSaving(false);
    if (error) { setError(skillErrorMessage(error.message)); return; }
    setSkills(prev => [...prev, { ...data, tech_skills: [] }].sort((a,b) => a.skill_name.localeCompare(b.skill_name)));
    setNewName(""); setAddOpen(false);
    toast.success("تمت إضافة المهارة");
  };

  const saveEdit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editSkill || !editName.trim() || saving) return;
    setSaving(true); setError("");
    const { error } = await supabase.from("skills").update({ skill_name: editName.trim() }).eq("id", editSkill.id);
    setSaving(false);
    if (error) { setError(skillErrorMessage(error.message)); return; }
    setSkills(prev => prev.map(s => s.id === editSkill.id ? { ...s, skill_name: editName.trim() } : s));
    setEditSkill(null);
    toast.success("تم حفظ التعديل");
  };

  const deleteSkill = async (skill: Skill, techCount: number) => {
    const ok = await confirm({
      title: "حذف المهارة؟",
      message: (
        <>
          حذف مهارة <span className="font-semibold text-text">{skill.skill_name}</span>؟ سيتم إلغاء ربطها بالفنيين
          {techCount > 0 ? <> (<span className="tabular-nums">{techCount}</span> فني)</> : null}.
        </>
      ),
      confirmText: "حذف المهارة",
      tone: "danger",
    });
    if (!ok) return;
    const { error: unlinkError } = await supabase.from("tech_skills").delete().eq("skill_id", skill.id);
    if (unlinkError) { toast.error(unlinkError.message); return; }
    const { error: deleteError } = await supabase.from("skills").delete().eq("id", skill.id);
    if (deleteError) {
      // الربط بالفنيين اتمسح فعلاً، بس المهارة نفسها لسه موجودة
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, tech_skills: [] } : s));
      toast.error(deleteError.message);
      return;
    }
    setSkills(prev => prev.filter(s => s.id !== skill.id));
    toast.success("تم حذف المهارة");
  };

  return (
    <Page width="4xl">
      <PageHeader
        title="المهارات"
        icon={Wrench}
        subtitle={<span className="tabular-nums">{skills.length} مهارة</span>}
        actions={
          <button onClick={() => setAddOpen(true)} className="eg-btn-primary eg-btn-sm">
            <Plus className="size-3.5" />إضافة مهارة
          </button>
        }
      />

      <PageBody>
        {skills.length === 0 ? (
          <div className="eg-card">
            <EmptyState
              icon={Wrench}
              message="لا توجد مهارات مسجلة بعد"
              description="أضف المهارات وبعدين اربطها بالفنيين من صفحة كل فني."
              action={
                <button onClick={() => setAddOpen(true)} className="eg-btn-primary eg-btn-sm">
                  <Plus className="size-3.5" />إضافة مهارة
                </button>
              }
            />
          </div>
        ) : (
          <div className="eg-stagger space-y-3">
            {skills.map(skill => {
              const techs = skill.tech_skills.flatMap(ts => ts.technicians).filter(Boolean) as Tech[];
              return (
                <div key={skill.id} className="eg-card !p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <h2 className="truncate text-sm font-semibold text-text">{skill.skill_name}</h2>
                      <Badge label={`${techs.length} فني`} tone="neutral" dot={false} className="tabular-nums" />
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Tooltip content="تعديل">
                        <button onClick={() => { setEditSkill(skill); setEditName(skill.skill_name); setError(""); }}
                          className="eg-icon-btn" aria-label={`تعديل مهارة ${skill.skill_name}`}>
                          <Pencil className="size-3.5" />
                        </button>
                      </Tooltip>
                      <Tooltip content="حذف">
                        <button onClick={() => deleteSkill(skill, techs.length)}
                          className="eg-icon-btn-danger" aria-label={`حذف مهارة ${skill.skill_name}`}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {techs.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {techs.map(t => (
                        <Link key={t.id} href={`/technicians/${t.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-card2/60 px-2.5 py-1 text-xs font-medium text-text outline-none transition-colors hover:border-accent/40 hover:text-text focus-visible:ring-2 focus-visible:ring-accent/50">
                          {t.name}
                          <span className="font-normal text-subtext">({t.grade})</span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-subtext">لا يوجد فنيين بهذه المهارة بعد</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PageBody>

      {/* إضافة مهارة */}
      <Modal open={addOpen} onClose={closeAdd} title="إضافة مهارة جديدة" size="sm">
        <form onSubmit={addSkill} className="space-y-4">
          <Field label="اسم المهارة" required>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              className="eg-input" placeholder="مثال: لحام كهربي" autoFocus />
          </Field>
          <FormError>{error}</FormError>
          <button type="submit" disabled={saving || !newName.trim()} className="eg-btn-primary w-full">
            {saving ? <Spinner /> : <Save className="size-4" />}
            {saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </form>
      </Modal>

      {/* تعديل مهارة */}
      <Modal open={!!editSkill} onClose={closeEdit} title="تعديل المهارة" size="sm">
        <form onSubmit={saveEdit} className="space-y-4">
          <Field label="اسم المهارة" required>
            <input value={editName} onChange={e => setEditName(e.target.value)}
              className="eg-input" autoFocus />
          </Field>
          <FormError>{error}</FormError>
          <button type="submit" disabled={saving || !editName.trim()} className="eg-btn-success w-full">
            {saving ? <Spinner /> : <Save className="size-4" />}
            {saving ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </form>
      </Modal>
    </Page>
  );
}
