"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { today, cn } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Field, { FormError } from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import { Page, PageHeader, PageBody } from "@/components/ui/Page";
import { FilterChip, ChipRow, SearchInput } from "@/components/ui/Filters";
import { Plus, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ClipboardList, EyeOff } from "lucide-react";

const STATUSES = ["لم يبدأ", "جاري", "متوقف", "مكتمل", "تم التسليم"] as const;
const PRIORITIES = ["منخفضة", "متوسطة", "عالية", "عاجلة"] as const;
const DONE = ["مكتمل", "تم التسليم"];
const CHECKS = [
  { key: "chk_client", label: "استلمه العميل" },
  { key: "chk_quality", label: "استلمته الجودة" },
  { key: "chk_assembly", label: "التجميع الكهربي" },
] as const;

type WO = {
  id: number; wo_number: string; status: string; description: string | null;
  client_name: string | null; project_name: string | null; priority: string | null; plan_month: string | null;
  department: string | null; created_date: string | null; expected_delivery: string | null;
  completion_date: string | null; chk_client: boolean | null; chk_quality: boolean | null; chk_assembly: boolean | null;
};
type SortCol = "wo_number" | "status" | "created_date" | "expected_delivery" | "completion_date";

const EMPTY_FORM = { wo_number: "", client_name: "", project_name: "", description: "", status: "لم يبدأ", expected_delivery: "", priority: "متوسطة", plan_month: "" };

export default function WorkOrdersClient({ initialWOs, role, canCreate, isDesign }: { initialWOs: WO[]; role: string; canCreate: boolean; isDesign: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const todayStr = today();
  // مكتب التصميم مايشوفش الحالة والأولوية والتسليم وشهر الخطة في فورم الإنشاء (المدير بيحددهم)
  const isDesignOnly = isDesign && role !== "manager";

  const [wos, setWOs] = useState<WO[]>(initialWOs);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("الكل");
  const [filterPriority, setFilterPriority] = useState<string>("الكل");
  const [hideDone, setHideDone] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>("created_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isLate = (w: WO) => !!w.expected_delivery && w.expected_delivery < todayStr && !DONE.includes(w.status);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: wos.length, late: 0 };
    STATUSES.forEach(s => (c[s] = 0));
    wos.forEach(w => {
      c[w.status] = (c[w.status] ?? 0) + 1;
      if (isLate(w)) c.late++;
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wos]);

  const visible = useMemo(() => {
    const list = wos.filter(w =>
      (!search || w.wo_number.toLowerCase().includes(search.toLowerCase()) || (w.description ?? "").toLowerCase().includes(search.toLowerCase()) || (w.client_name ?? "").toLowerCase().includes(search.toLowerCase()) || (w.project_name ?? "").toLowerCase().includes(search.toLowerCase())) &&
      (filterStatus === "الكل" || (filterStatus === "متأخر" ? isLate(w) : w.status === filterStatus)) &&
      (filterPriority === "الكل" || w.priority === filterPriority) &&
      (!hideDone || !DONE.includes(w.status))
    );
    return [...list].sort((a, b) => {
      const av = String(a[sortCol] ?? ""), bv = String(b[sortCol] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wos, search, filterStatus, filterPriority, hideDone, sortCol, sortDir, todayStr]);

  const filtersActive = !!search || filterStatus !== "الكل" || filterPriority !== "الكل" || hideDone;
  const clearFilters = () => { setSearch(""); setFilterStatus("الكل"); setFilterPriority("الكل"); setHideDone(false); };

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const closeAdd = () => { setAddOpen(false); setError(""); };

  const addWO = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.wo_number.trim() || saving) return;
    setSaving(true); setError("");
    let newId: number | null = null;
    if (isDesign) {
      const { data, error: e } = await supabase.rpc("create_work_order_design", {
        p_wo_number: form.wo_number.trim(),
        p_description: form.description.trim(),
        p_expected_delivery: form.expected_delivery || null,
        p_plan_month: form.plan_month || null,
        p_priority: form.priority,
        p_client_name: form.client_name.trim(),
        p_project_name: form.project_name.trim(),
      });
      setSaving(false);
      if (e) { setError(e.message); return; }
      newId = (data as { id: number }).id;
      const { data: fresh } = await supabase.from("work_orders").select("*").eq("id", newId).single();
      if (fresh) setWOs(prev => [fresh, ...prev]);
    } else {
      const { data, error: e } = await supabase.from("work_orders")
        .insert({
          wo_number: form.wo_number.trim(),
          client_name: form.client_name.trim() || null,
          project_name: form.project_name.trim() || null,
          description: form.description.trim() || null,
          status: form.status,
          priority: form.priority,
          expected_delivery: form.expected_delivery || null,
          plan_month: form.plan_month || null,
          created_date: todayStr,
        })
        .select().single();
      setSaving(false);
      if (e) { setError(e.message); return; }
      setWOs(prev => [data, ...prev]);
      newId = data.id;
    }
    setAddOpen(false);
    setForm(EMPTY_FORM);
    router.push(`${pathname}/${newId}`);
  };

  const sortProps = { sortCol, sortDir, onSort: toggleSort };

  return (
    <Page width="7xl">
      <PageHeader
        title="أوامر الشغل"
        icon={ClipboardList}
        subtitle={<span className="tabular-nums">{visible.length === wos.length ? `${wos.length} أمر` : `${visible.length} من ${wos.length} أمر`}</span>}
        actions={<>
          <SearchInput value={search} onChange={setSearch} placeholder="بحث بالرقم أو العميل أو الوصف" className="w-full sm:w-60" />
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            aria-label="الأولوية" className="eg-select eg-input-sm w-36">
            <option value="الكل">كل الأولويات</option>
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
          {canCreate && (
            <button onClick={() => setAddOpen(true)} className="eg-btn-primary eg-btn-sm">
              <Plus className="size-3.5" />أمر شغل جديد
            </button>
          )}
        </>}
      >
        {/* فلتر الحالات بعدادات */}
        <ChipRow>
          <FilterChip active={filterStatus === "الكل"} onClick={() => setFilterStatus("الكل")} count={counts.all}>الكل</FilterChip>
          {STATUSES.map(s => (
            <FilterChip key={s} active={filterStatus === s} onClick={() => setFilterStatus(s)} count={counts[s] ?? 0}>{s}</FilterChip>
          ))}
          <FilterChip active={filterStatus === "متأخر"} onClick={() => setFilterStatus("متأخر")} count={counts.late} tone="danger">متأخر</FilterChip>
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
          <FilterChip active={hideDone} onClick={() => setHideDone(v => !v)}>
            <EyeOff className="size-3.5" />إخفاء المنتهي
          </FilterChip>
        </ChipRow>
      </PageHeader>

      <PageBody>
        <div className="eg-card overflow-hidden !p-0">
          {visible.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="eg-table min-w-[880px]">
                <thead>
                  <tr>
                    <SortHeader col="wo_number" label="رقم الأمر" {...sortProps} />
                    <SortHeader col="status" label="الحالة" {...sortProps} />
                    <th>الأولوية</th>
                    <th>شهر الخطة</th>
                    <SortHeader col="created_date" label="الإنشاء" {...sortProps} />
                    <SortHeader col="expected_delivery" label="التسليم المتوقع" {...sortProps} />
                    <SortHeader col="completion_date" label="الإتمام" {...sortProps} />
                    <th className="text-center">التحقق</th>
                    <th className="w-10"><span className="sr-only">فتح</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(w => {
                    const late = isLate(w);
                    const href = `${pathname}/${w.id}`;
                    return (
                      <tr key={w.id} onClick={() => router.push(href)} className="group cursor-pointer">
                        <td className="max-w-[320px]">
                          <Link href={href} onClick={e => e.stopPropagation()}
                            className="font-mono text-[13px] font-semibold text-accent underline-offset-4 hover:underline">
                            {w.wo_number}
                          </Link>
                          {(w.client_name || w.project_name) && (
                            <div className="truncate text-[11px] text-subtext">{[w.client_name, w.project_name].filter(Boolean).join(" · ")}</div>
                          )}
                        </td>
                        <td><Badge label={w.status} /></td>
                        <td>{w.priority ? <Badge label={w.priority} dot={false} /> : <span className="text-muted">—</span>}</td>
                        <td className="tabular-nums text-subtext">{w.plan_month ?? "—"}</td>
                        <td className="tabular-nums text-subtext">{w.created_date ?? "—"}</td>
                        <td className={cn("tabular-nums", late ? "font-semibold text-danger" : "text-subtext")}>
                          {w.expected_delivery ?? "—"}
                          {late && <span className="mr-1.5 rounded bg-danger/10 px-1.5 py-0.5 text-[11px] font-medium">متأخر</span>}
                        </td>
                        <td className="tabular-nums text-subtext">{w.completion_date ?? "—"}</td>
                        <td>
                          <div className="flex items-center justify-center gap-1.5">
                            {CHECKS.map(c => {
                              const on = !!w[c.key];
                              return (
                                <span key={c.key} title={`${c.label}: ${on ? "تم" : "لسه"}`} aria-label={`${c.label}: ${on ? "تم" : "لسه"}`}
                                  className={cn("size-2 rounded-full", on ? "bg-success" : "bg-border-strong")} />
                              );
                            })}
                          </div>
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
              message={wos.length ? "لا توجد أوامر شغل مطابقة للفلتر" : "لسه مفيش أوامر شغل"}
              description={wos.length ? "غيّر الفلاتر أو امسح البحث علشان تشوف باقي الأوامر." : canCreate ? "ابدأ بإضافة أول أمر شغل." : undefined}
              action={wos.length && filtersActive
                ? <button onClick={clearFilters} className="eg-btn-ghost eg-btn-sm">مسح الفلاتر</button>
                : !wos.length && canCreate
                  ? <button onClick={() => setAddOpen(true)} className="eg-btn-primary eg-btn-sm"><Plus className="size-3.5" />أمر شغل جديد</button>
                  : undefined}
            />
          )}
        </div>
      </PageBody>

      {/* مودال الإضافة */}
      <Modal open={addOpen} onClose={closeAdd} title="أمر شغل جديد" description="بعد الحفظ هيتفتح الأمر علشان تكمّل بنوده.">
        <form onSubmit={addWO} className="space-y-4">
          <Field label="رقم أمر الشغل" required>
            <input value={form.wo_number} onChange={e => setForm(f => ({ ...f, wo_number: e.target.value }))}
              className="eg-input font-mono" placeholder="مثال: WO-2026-001" autoFocus dir="ltr" />
          </Field>
          {!isDesignOnly && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="الحالة">
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="eg-select">
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="الأولوية">
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="eg-select">
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="التسليم المتوقع">
                <input type="date" value={form.expected_delivery}
                  onChange={e => setForm(f => ({ ...f, expected_delivery: e.target.value }))} className="eg-input" />
              </Field>
              <Field label="شهر الخطة">
                <input type="month" value={form.plan_month}
                  onChange={e => setForm(f => ({ ...f, plan_month: e.target.value }))} className="eg-input" />
              </Field>
            </div>
          )}
          <Field label="الوصف">
            <textarea rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="eg-input resize-y" placeholder="وصف مختصر لأمر الشغل (المنتج، المطلوب، ملاحظات...)" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="اسم العميل">
              <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} className="eg-input" />
            </Field>
            <Field label="اسم المشروع">
              <input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} className="eg-input" />
            </Field>
          </div>
          <FormError>{error}</FormError>
          <button type="submit" disabled={saving || !form.wo_number.trim()} className="eg-btn-primary w-full">
            {saving && <Spinner />}
            {saving ? "جاري الحفظ..." : "حفظ وفتح الأمر"}
          </button>
        </form>
      </Modal>
    </Page>
  );
}

function SortHeader({ col, label, sortCol, sortDir, onSort, className }: {
  col: SortCol; label: string; sortCol: SortCol; sortDir: "asc" | "desc"; onSort: (c: SortCol) => void; className?: string;
}) {
  const active = sortCol === col;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={className} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(col)}
        className={cn("inline-flex items-center gap-1 rounded transition-colors hover:text-text", active && "text-text")}>
        {label}
        <Icon className={cn("size-3", active ? "text-accent" : "opacity-40")} />
      </button>
    </th>
  );
}
