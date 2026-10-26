"use client";
import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Field, { FormError } from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import Tooltip from "@/components/ui/Tooltip";
import { Page, PageHeader, PageBody } from "@/components/ui/Page";
import { StatCard } from "@/components/ui/StatCard";
import { SearchInput } from "@/components/ui/Filters";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
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
  const toast = useToast();
  const confirm = useConfirm();
  const [violations, setViolations] = useState<Violation[]>(initialViolations);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ tech_id: "", date: today(), reason: "", details: "" });

  const filtered = violations.filter(v =>
    !search ||
    (v.technician?.name ?? "").includes(search) ||
    (v.reason ?? "").includes(search)
  );

  const addViolation = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.tech_id || !form.reason.trim() || saving) return;
    setSaving(true); setError("");
    const { data, error } = await supabase.from("violations").insert({
      tech_id: parseInt(form.tech_id),
      date: form.date || today(),
      reason: form.reason,
      details: form.details,
    }).select("*, technician:technicians(id, name)").single();
    setSaving(false);
    if (error) { setError(error.message); return; }
    setViolations(prev => [data, ...prev]);
    setAddOpen(false);
    setForm({ tech_id: "", date: today(), reason: "", details: "" });
    toast.success("تم تسجيل المخالفة");
  };

  const deleteViolation = async (v: Violation) => {
    const ok = await confirm({
      title: "حذف المخالفة؟",
      message: <>هتتحذف مخالفة <span className="font-semibold text-text">{v.technician?.name ?? "الفني"}</span>{v.date && <> بتاريخ <span className="tabular-nums">{v.date}</span></>}.</>,
      confirmText: "حذف المخالفة",
    });
    if (!ok) return;
    const { error } = await supabase.from("violations").delete().eq("id", v.id);
    if (error) { toast.error(error.message); return; }
    setViolations(prev => prev.filter(x => x.id !== v.id));
    toast.success("تم حذف المخالفة");
  };

  const thisMonth = today().slice(0, 7);

  return (
    <Page width="5xl">
      <PageHeader
        title="المخالفات"
        icon={AlertTriangle}
        subtitle={`${violations.length} مخالفة مسجلة`}
        actions={<>
          <SearchInput value={search} onChange={setSearch} placeholder="بحث بالاسم أو السبب" className="w-full sm:w-56" />
          <button onClick={() => setAddOpen(true)} className="eg-btn-danger eg-btn-sm">
            <Plus className="size-3.5" />تسجيل مخالفة
          </button>
        </>}
      />

      <PageBody>
        <div className="eg-stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="إجمالي المخالفات" value={violations.length} tone={violations.length ? "danger" : "muted"} />
          <StatCard label="هذا الشهر" value={violations.filter(v => v.date?.startsWith(thisMonth)).length} tone="warning" />
          <StatCard label="فنيين عليهم مخالفات" value={new Set(violations.map(v => v.tech_id)).size} className="col-span-2 sm:col-span-1" />
        </div>

        <div className="eg-card overflow-hidden !p-0">
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="eg-table min-w-[620px]">
                <thead>
                  <tr>
                    <th>الفني</th><th>التاريخ</th><th>السبب</th><th>التفاصيل</th>
                    <th className="w-12"><span className="sr-only">إجراءات</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(v => (
                    <tr key={v.id}>
                      <td>
                        {v.technician?.id
                          ? <Link href={`/technicians/${v.technician.id}`} className="eg-link">{v.technician.name}</Link>
                          : <span className="text-subtext">—</span>}
                      </td>
                      <td className="tabular-nums text-subtext">{v.date ?? "—"}</td>
                      <td className="text-text">{v.reason ?? "—"}</td>
                      <td className="max-w-[280px] text-subtext">{v.details || "—"}</td>
                      <td>
                        <Tooltip content="حذف">
                          <button onClick={() => deleteViolation(v)} className="eg-icon-btn-danger" aria-label="حذف المخالفة">
                            <Trash2 className="size-3.5" />
                          </button>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              message={violations.length ? "مفيش مخالفات مطابقة للبحث" : "لا توجد مخالفات"}
              action={search ? <button onClick={() => setSearch("")} className="eg-btn-ghost eg-btn-sm">مسح البحث</button> : undefined}
            />
          )}
        </div>
      </PageBody>

      {/* تسجيل مخالفة */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); setError(""); }} title="تسجيل مخالفة جديدة">
        <form onSubmit={addViolation} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="الفني" required>
              <select value={form.tech_id} onChange={e => setForm(f => ({ ...f, tech_id: e.target.value }))} className="eg-select">
                <option value="">اختر فني...</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="التاريخ">
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="eg-input" />
            </Field>
          </div>
          <Field label="السبب" required>
            <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="eg-input" placeholder="مثال: تأخر عن العمل" />
          </Field>
          <Field label="التفاصيل">
            <textarea value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
              className="eg-input resize-y" rows={3} placeholder="تفاصيل إضافية..." />
          </Field>
          <FormError>{error}</FormError>
          <button type="submit" disabled={saving || !form.tech_id || !form.reason.trim()} className="eg-btn-danger w-full">
            {saving ? <Spinner /> : <AlertTriangle className="size-4" />}
            {saving ? "جاري الحفظ..." : "تسجيل المخالفة"}
          </button>
        </form>
      </Modal>
    </Page>
  );
}
