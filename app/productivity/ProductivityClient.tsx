"use client";
import { useState, useMemo } from "react";
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
import { Plus, Trash2, BarChart3, ListChecks, Users, ClipboardCheck, FilterX } from "lucide-react";
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
  const toast = useToast();
  const confirm = useConfirm();
  const [records, setRecords] = useState<Record_[]>(initialRecords);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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

  const filtersActive = !!search || !!filterDate || !!filterWO;
  const clearFilters = () => { setFilterDate(""); setFilterWO(""); setSearch(""); };

  const closeAdd = () => { setAddOpen(false); setError(""); };

  const addRecord = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.tech_id || !form.task.trim() || saving) return;
    setSaving(true); setError("");
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
    if (error) { setError(error.message); return; }
    setRecords(prev => [data, ...prev]);
    setAddOpen(false);
    setForm({ tech_id: "", wo_id: "", work_date: today(), task: "", notes: "" });
    toast.success("تم تسجيل المهمة");
  };

  const deleteRecord = async (r: Record_) => {
    const ok = await confirm({
      title: "حذف هذا السجل؟",
      message: <>هيتحذف سجل <span className="font-semibold text-text">{r.technician?.name ?? "الفني"}</span> بتاريخ <span className="tabular-nums">{r.work_date}</span>.</>,
      confirmText: "حذف السجل",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("daily_productivity").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    setRecords(prev => prev.filter(x => x.id !== r.id));
    toast.success("تم حذف السجل");
  };

  const techCount = new Set(filtered.map(r => r.tech_id)).size;
  const woCount = new Set(filtered.map(r => r.wo_id).filter(Boolean)).size;

  return (
    <Page width="5xl">
      <PageHeader
        title="الإنتاجية اليومية"
        icon={BarChart3}
        actions={
          <button onClick={() => setAddOpen(true)} className="eg-btn-primary eg-btn-sm">
            <Plus className="size-3.5" />تسجيل مهمة
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="بحث بالفني أو المهمة أو الأمر" className="w-full sm:w-56" />
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            aria-label="التاريخ" className="eg-input eg-input-sm w-40" />
          <select value={filterWO} onChange={e => setFilterWO(e.target.value)}
            aria-label="أمر الشغل" className="eg-select eg-input-sm w-44">
            <option value="">كل أوامر الشغل</option>
            {wos.map(w => <option key={w.id} value={w.id}>{w.wo_number}</option>)}
          </select>
          {filtersActive && (
            <button onClick={clearFilters} className="eg-btn-subtle eg-btn-xs">
              <FilterX className="size-3" />مسح الفلاتر
            </button>
          )}
        </div>
      </PageHeader>

      <PageBody>
        <div className="eg-stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="مهام في الفلتر الحالي" value={filtered.length} tone="accent" icon={ListChecks} />
          <StatCard label="فنيين عملوا" value={techCount} tone="violet" icon={Users} />
          <StatCard label="أوامر شغل مُنجزة" value={woCount} tone="success" icon={ClipboardCheck} className="col-span-2 sm:col-span-1" />
        </div>

        <div className="eg-card overflow-hidden !p-0">
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="eg-table min-w-[720px]">
                <thead>
                  <tr>
                    <th>الفني</th><th>أمر الشغل</th><th>التاريخ</th>
                    <th>المهمة</th><th>ملاحظات</th>
                    <th className="w-12"><span className="sr-only">إجراءات</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td className="font-medium text-text">{r.technician?.name ?? "—"}</td>
                      <td>
                        {r.work_order?.wo_number
                          ? <span className="font-mono text-[13px] font-semibold text-accent">{r.work_order.wo_number}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="tabular-nums text-subtext">{r.work_date}</td>
                      <td className="max-w-[300px] text-text">{r.task}</td>
                      <td className="max-w-[240px] text-subtext">{r.notes ?? "—"}</td>
                      <td>
                        <Tooltip content="حذف">
                          <button onClick={() => deleteRecord(r)} className="eg-icon-btn-danger" aria-label="حذف السجل">
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
              icon={BarChart3}
              message="لا توجد سجلات إنتاجية"
              description={filtersActive ? "غيّر الفلاتر أو امسحها علشان تشوف باقي السجلات." : undefined}
              action={filtersActive
                ? <button onClick={clearFilters} className="eg-btn-ghost eg-btn-sm">مسح الفلاتر</button>
                : <button onClick={() => setAddOpen(true)} className="eg-btn-primary eg-btn-sm"><Plus className="size-3.5" />تسجيل مهمة</button>}
            />
          )}
        </div>
      </PageBody>

      {/* تسجيل مهمة */}
      <Modal open={addOpen} onClose={closeAdd} title="تسجيل مهمة إنتاجية">
        <form onSubmit={addRecord} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="الفني" required>
              <select value={form.tech_id} onChange={e => setForm(f => ({ ...f, tech_id: e.target.value }))}
                className="eg-select" autoFocus>
                <option value="">اختر فني...</option>
                {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="أمر الشغل">
              <select value={form.wo_id} onChange={e => setForm(f => ({ ...f, wo_id: e.target.value }))} className="eg-select">
                <option value="">— بدون أمر شغل —</option>
                {wos.map(w => <option key={w.id} value={w.id}>{w.wo_number}</option>)}
              </select>
            </Field>
            <Field label="التاريخ">
              <input type="date" value={form.work_date} onChange={e => setForm(f => ({ ...f, work_date: e.target.value }))} className="eg-input" />
            </Field>
          </div>
          <Field label="المهمة" required>
            <input value={form.task} onChange={e => setForm(f => ({ ...f, task: e.target.value }))}
              className="eg-input" placeholder="مثال: تجميع لوحة رئيسية WO1978" />
          </Field>
          <Field label="ملاحظات">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="eg-input resize-y" rows={2} placeholder="ملاحظات إضافية..." />
          </Field>
          <FormError>{error}</FormError>
          <button type="submit" disabled={saving || !form.tech_id || !form.task.trim()} className="eg-btn-primary w-full">
            {saving ? <Spinner /> : <ClipboardCheck className="size-4" />}
            {saving ? "جاري الحفظ..." : "تسجيل المهمة"}
          </button>
        </form>
      </Modal>
    </Page>
  );
}
