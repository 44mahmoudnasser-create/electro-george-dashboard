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
import { Plus, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ClipboardList, EyeOff, Printer } from "lucide-react";
import PrintWorkOrders from "./PrintWorkOrders";
import { downloadExpectedInvoice } from "@/lib/expected-invoice";
import { FileSpreadsheet } from "lucide-react";

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

export default function WorkOrdersClient({ initialWOs, initialItems, role, canCreate, isDesign }: { initialWOs: WO[]; initialItems: any[]; role: string; canCreate: boolean; isDesign: boolean }) {
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
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
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

  // ترتيب بالقايمة (بدل أعمدة الجدول)
  const SORTS = {
    recent: { col: "created_date" as SortCol, dir: "desc" as const, label: "الأحدث" },
    due: { col: "expected_delivery" as SortCol, dir: "asc" as const, label: "الأقرب تسليم" },
    latest_due: { col: "expected_delivery" as SortCol, dir: "desc" as const, label: "الأبعد تسليم" },
    number: { col: "wo_number" as SortCol, dir: "asc" as const, label: "رقم الأمر" },
  };
  const sortKey = (Object.keys(SORTS) as (keyof typeof SORTS)[]).find(k => SORTS[k].col === sortCol && SORTS[k].dir === sortDir) ?? "recent";
  const applySort = (k: keyof typeof SORTS) => { setSortCol(SORTS[k].col); setSortDir(SORTS[k].dir); };

  // بنود كل أمر (للتقدم)
  const itemsByWo = useMemo(() => {
    const m = new Map<number, { job_status: string }[]>();
    initialItems.forEach(i => {
      if (!m.has(i.wo_id)) m.set(i.wo_id, []);
      m.get(i.wo_id)!.push({ job_status: i.job_status });
    });
    return m;
  }, [initialItems]);

  const summary = useMemo(() => ({
    open: wos.filter(w => !DONE.includes(w.status)).length,
    late: wos.filter(isLate).length,
    inProgress: wos.filter(w => w.status === "جاري").length,
    done: wos.filter(w => DONE.includes(w.status)).length,
  }), [wos, todayStr]);

  const defaultInvoiceMonth = useMemo(() => {
    const ids = new Set(visible.map(w => w.id));
    const counts = new Map<string, number>();
    initialItems.filter(i => ids.has(i.wo_id) && i.plan_month).forEach(i => {
      counts.set(i.plan_month, (counts.get(i.plan_month) ?? 0) + 1);
    });
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top) return top;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, [visible, initialItems]);
  const [invoiceMonth, setInvoiceMonth] = useState("");
  const chosenMonth = invoiceMonth || defaultInvoiceMonth;
  const invoiceCount = initialItems.filter(i => i.plan_month === chosenMonth && visible.some(w => w.id === i.wo_id)).length;
  return (
    <>
    <div className="print:hidden">
    <Page width="7xl">
      <PageHeader
        title="أوامر الشغل"
        icon={ClipboardList}
        subtitle={<span className="tabular-nums">{visible.length === wos.length ? `${wos.length} أمر` : `${visible.length} من ${wos.length} أمر`}</span>}
        actions={<>
          <button onClick={() => setInvoiceOpen(true)} className="eg-btn-ghost eg-btn-sm" title="تحميل الأوامر بنفس قالب Excel">
            <FileSpreadsheet className="size-3.5" />Excel
          </button>
          <button onClick={() => window.print()} className="eg-btn-ghost eg-btn-sm" title="طباعة الأوامر المعروضة">
            <Printer className="size-3.5" />طباعة
          </button>
          {canCreate && (
            <button onClick={() => setAddOpen(true)} className="eg-btn-primary eg-btn-sm">
              <Plus className="size-3.5" />أمر جديد
            </button>
          )}
        </>}
      />

      <PageBody>
        {/* الملخص: الأرقام الأهم بس، والمتأخر هو اللي بيبان */}
        <dl className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <SummaryFigure label="مفتوح" value={summary.open} />
          <SummaryFigure label="متأخر" value={summary.late} tone={summary.late ? "danger" : "muted"} emphasis />
          <SummaryFigure label="جاري" value={summary.inProgress} tone="accent" />
          <SummaryFigure label="مكتمل" value={summary.done} tone="success" />
        </dl>

        {/* أدوات البحث والترتيب والفلاتر */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالرقم أو العميل أو الوصف" className="w-full sm:w-64" />
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
              aria-label="الأولوية" className="eg-select eg-input-sm w-36">
              <option value="الكل">كل الأولويات</option>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
            <select value={sortKey} onChange={e => applySort(e.target.value as keyof typeof SORTS)}
              aria-label="الترتيب" className="eg-select eg-input-sm w-40">
              {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map(k => <option key={k} value={k}>{SORTS[k].label}</option>)}
            </select>
            <FilterChip active={hideDone} onClick={() => setHideDone(v => !v)}>
              <EyeOff className="size-3.5" />إخفاء المنتهي
            </FilterChip>
          </div>
          <ChipRow>
            <FilterChip active={filterStatus === "الكل"} onClick={() => setFilterStatus("الكل")} count={counts.all}>الكل</FilterChip>
            {STATUSES.map(s => (
              <FilterChip key={s} active={filterStatus === s} onClick={() => setFilterStatus(s)} count={counts[s] ?? 0}>{s}</FilterChip>
            ))}
            <FilterChip active={filterStatus === "متأخر"} onClick={() => setFilterStatus("متأخر")} count={counts.late} tone="danger">متأخر</FilterChip>
          </ChipRow>
        </div>

        {/* القايمة */}
        {visible.length > 0 ? (
          <ul className="eg-card divide-y divide-border/60 overflow-hidden !p-0">
            {visible.map(w => {
              const its = itemsByWo.get(w.id) ?? [];
              const total = its.length;
              const delivered = its.filter(i => i.job_status === "تم التسليم").length;
              const pct = total ? Math.round((delivered / total) * 100) : 0;
              const late = isLate(w);
              const href = `${pathname}/${w.id}`;
              const rail = late ? "bg-danger" : RAIL[w.status] ?? "bg-border-strong";
              return (
                <li key={w.id}>
                  <Link href={href} className="group relative flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-card2/50">
                    <span aria-hidden className={cn("absolute inset-y-0 start-0 w-[3px]", rail)} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-sm font-semibold text-text">{w.wo_number}</span>
                        <Badge label={w.status} />
                        {w.priority && w.priority !== "متوسطة" && <Badge label={w.priority} dot={false} />}
                      </div>
                      <p className="truncate text-xs text-subtext">
                        {[w.client_name, w.project_name].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {total > 0 && (
                        <div className="flex items-center gap-2.5">
                          <div className="h-1 w-40 overflow-hidden rounded-full bg-card2" aria-hidden>
                            <div className={cn("h-full transition-[width] duration-500 ease-out", pct === 100 ? "bg-success" : "bg-accent")}
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] tabular-nums text-subtext">{delivered} من {total} بند اتسلم</span>
                        </div>
                      )}
                    </div>
                    <div className="hidden shrink-0 text-end sm:block">
                      <p className={cn("text-xs tabular-nums", late ? "font-semibold text-danger" : "text-subtext")}>
                        {w.expected_delivery ?? "من غير موعد"}
                      </p>
                      {late && <p className="text-[11px] font-medium text-danger">متأخر</p>}
                      {w.plan_month && <p className="mt-0.5 text-[11px] tabular-nums text-muted">خطة {w.plan_month}</p>}
                    </div>
                    <ChevronLeft className="size-4 shrink-0 text-muted transition-transform duration-150 group-hover:-translate-x-0.5 group-hover:text-text" />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="eg-card">
            <EmptyState
              message={wos.length ? "مفيش أوامر بالفلتر ده" : "لسه مفيش أوامر شغل"}
              description={wos.length ? "غيّر الفلاتر أو امسح البحث علشان تشوف باقي الأوامر." : canCreate ? "ابدأ بإضافة أول أمر شغل." : undefined}
              action={wos.length && filtersActive
                ? <button onClick={clearFilters} className="eg-btn-ghost eg-btn-sm">امسح الفلاتر</button>
                : !wos.length && canCreate
                  ? <button onClick={() => setAddOpen(true)} className="eg-btn-primary eg-btn-sm"><Plus className="size-3.5" />أمر جديد</button>
                  : undefined}
            />
          </div>
        )}
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
      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="تحميل Expected invoice" size="sm">
        <div className="space-y-4">
          <div>
            <label className="eg-label">اختار الشهر</label>
            <input type="month" value={chosenMonth} onChange={e => setInvoiceMonth(e.target.value)} className="eg-input" />
            <p className="mt-1.5 text-[11px] text-subtext">
              {invoiceCount} بند خطتهم في الشهر ده، والتقرير هيتحمل بيهم بس.
            </p>
          </div>
          <button
            disabled={invoiceBusy || invoiceCount === 0 || !chosenMonth}
            onClick={async () => {
              setInvoiceBusy(true);
              try {
                await downloadExpectedInvoice(visible, initialItems, chosenMonth);
                setInvoiceOpen(false);
              } catch (e) {
                alert((e as Error).message);
              } finally {
                setInvoiceBusy(false);
              }
            }}
            className="eg-btn-primary w-full justify-center"
          >
            <FileSpreadsheet className="size-3.5" />{invoiceBusy ? "جاري التحميل..." : "تحميل Excel"}
          </button>
        </div>
      </Modal>
    </Page>
    </div>
    <PrintWorkOrders wos={visible} items={initialItems} />
    </>
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

// ألوان شريط الجنب لكل حالة (المتأخر بيتحط فوق)
const RAIL: Record<string, string> = {
  "لم يبدأ": "bg-border-strong",
  "جاري": "bg-accent",
  "متوقف": "bg-warning",
  "مكتمل": "bg-success",
  "تم التسليم": "bg-success/40",
};

// رقم في الملخص فوق القايمة
function SummaryFigure({ label, value, tone = "default", emphasis = false }: {
  label: string; value: number; tone?: "default" | "muted" | "accent" | "success" | "danger"; emphasis?: boolean;
}) {
  const T: Record<string, string> = {
    default: "text-text", muted: "text-subtext", accent: "text-accent", success: "text-success", danger: "text-danger",
  };
  return (
    <div>
      <dt className="text-xs text-subtext">{label}</dt>
      <dd className={cn("font-bold leading-none tabular-nums", emphasis ? "text-3xl" : "text-2xl", T[tone])}>{value}</dd>
    </div>
  );
}
