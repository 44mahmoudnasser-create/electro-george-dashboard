"use client";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Field, { FormError } from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import { Page, PageHeader, PageBody, SectionHeader } from "@/components/ui/Page";
import { StatCard } from "@/components/ui/StatCard";
import { SearchInput } from "@/components/ui/Filters";
import { useToast } from "@/components/ui/Toast";
import { Plus, Save, Hammer, Power, PowerOff, ListPlus, Boxes, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = {
  id: number; name: string; category: string | null; is_consumable: boolean; unit: string;
  department: string | null; active: boolean;
};
type Item = { id: number; tool_id: number; serial_no: string; status: string; notes: string | null };

const EMPTY_FORM = { name: "", category: "", is_consumable: false, unit: "عدد", department: "" };

const TYPE_OPTIONS = [
  { v: false, label: "قابلة لإعادة الاستخدام", hint: "برقم تسلسلي لكل قطعة" },
  { v: true, label: "مستهلكة", hint: "بالكمية، من غير رقم" },
];

// رقم في كل سطر، أو مفصولين بفاصلة / Tab (لصق من إكسل)
const parseSerials = (text: string) => text.split(/\r?\n|,|\t/).map(s => s.trim()).filter(Boolean);

// شارة نوع الأداة
function TypeBadge({ consumable, className }: { consumable: boolean; className?: string }) {
  return (
    <Badge
      label={consumable ? "مستهلكة" : "إعادة استخدام"}
      tone={consumable ? "neutral" : "accent"}
      dot={false}
      className={className}
    />
  );
}

export default function ToolsClient({
  initialTools, initialItems, departments,
}: {
  initialTools: Tool[]; initialItems: Item[]; departments: string[];
}) {
  const toast = useToast();
  const [tools, setTools] = useState<Tool[]>(initialTools);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [selectedId, setSelectedId] = useState<number | null>(initialTools[0]?.id ?? null);
  const [search, setSearch] = useState("");

  const flash = (ok: boolean, text: string) => toast.show(ok, text);

  const selected = tools.find(t => t.id === selectedId) ?? null;
  const filtered = useMemo(
    () => tools.filter(t => !search || t.name.includes(search)),
    [tools, search]
  );

  const itemsOf = (toolId: number) => items.filter(i => i.tool_id === toolId);
  const countBy = (toolId: number) => {
    const list = itemsOf(toolId);
    const c: Record<string, number> = {};
    list.forEach(i => { c[i.status] = (c[i.status] ?? 0) + 1; });
    return c;
  };

  /* ─────────── إضافة أداة ─────────── */
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const closeAdd = () => { setAddOpen(false); setError(""); };

  const addTool = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true); setError("");
    const { data, error: e } = await supabase.from("tools").insert({
      name: form.name.trim(),
      category: form.category.trim() || null,
      is_consumable: form.is_consumable,
      unit: form.unit.trim() || "عدد",
      department: form.department || null,
    }).select("*").single();
    setSaving(false);
    if (e) { setError(e.message.includes("unique") ? "الأداة دي موجودة قبل كده لنفس القسم" : e.message); return; }
    setTools(prev => [...prev, data as Tool].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedId(data.id);
    setAddOpen(false); setForm(EMPTY_FORM);
    flash(true, `تمت إضافة ${data.name}`);
  };

  /* ─────────── تفعيل / تعطيل ─────────── */
  const [toggling, setToggling] = useState(false);

  const toggleActive = async (t: Tool) => {
    if (toggling) return;
    setToggling(true);
    const { error: e } = await supabase.from("tools").update({ active: !t.active }).eq("id", t.id);
    setToggling(false);
    if (e) { flash(false, e.message); return; }
    setTools(prev => prev.map(x => x.id === t.id ? { ...x, active: !t.active } : x));
    flash(true, t.active ? `تم تعطيل ${t.name}` : `تم تفعيل ${t.name}`);
  };

  /* ─────────── أرقام تسلسلية ─────────── */
  const [serialsText, setSerialsText] = useState("");
  const [addingSerials, setAddingSerials] = useState(false);

  const addSerials = async () => {
    if (!selected || addingSerials) return;
    const serials = parseSerials(serialsText);
    if (serials.length === 0) return;
    setAddingSerials(true);
    const { data, error: e } = await supabase.rpc("add_tool_items", {
      p_tool_id: selected.id, p_serials: serials,
    });
    setAddingSerials(false);
    if (e) { flash(false, e.message); return; }
    // نجيب القطع الجديدة من الداتابيز علشان الترتيب والـ id يبقوا صح
    const { data: fresh } = await supabase.from("tool_items")
      .select("id, tool_id, serial_no, status, notes").eq("tool_id", selected.id).order("serial_no");
    if (fresh) setItems(prev => [...prev.filter(i => i.tool_id !== selected.id), ...(fresh as Item[])]);
    setSerialsText("");
    flash(true, `تمت إضافة ${data} قطعة`);
  };

  const sel = selected ? countBy(selected.id) : {};
  const selItems = selected ? itemsOf(selected.id) : [];
  const serialCount = parseSerials(serialsText).length;

  const newToolButton = (
    <button onClick={() => setAddOpen(true)} className="eg-btn-primary eg-btn-sm">
      <Plus className="size-3.5" />أداة جديدة
    </button>
  );

  return (
    <Page width="6xl">
      <PageHeader
        title="الأدوات والعهد"
        icon={Hammer}
        subtitle={<span className="tabular-nums">{tools.length} أداة</span>}
        actions={newToolButton}
      />

      <PageBody>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* ═══ الكتالوج ═══ */}
          <div className="lg:sticky lg:top-24 lg:col-span-5 lg:self-start">
            <div className="eg-card overflow-hidden !p-0">
              <div className="border-b border-border/60 p-3">
                <SearchInput value={search} onChange={setSearch} placeholder="بحث باسم الأداة" className="w-full" />
              </div>
              {filtered.length > 0 ? (
                <ul className="divide-y divide-border/50 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto">
                  {filtered.map(t => {
                    const c = countBy(t.id);
                    const isSelected = t.id === selectedId;
                    return (
                      <li key={t.id}>
                        <button type="button" onClick={() => setSelectedId(t.id)} aria-current={isSelected ? "true" : undefined}
                          className={cn(
                            "relative block w-full px-4 py-2.5 text-start outline-none transition-colors focus-visible:bg-card2/70",
                            isSelected ? "bg-accent/[0.06]" : "hover:bg-card2/50",
                          )}>
                          {isSelected && <span aria-hidden className="absolute inset-y-1.5 start-0 w-[3px] rounded-e-full bg-accent" />}
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn("truncate text-sm font-medium text-text", !t.active && "opacity-50")}>{t.name}</span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              {!t.active && <Badge label="متعطلة" tone="danger" dot={false} />}
                              <TypeBadge consumable={t.is_consumable} className={cn(!t.active && "opacity-50")} />
                            </span>
                          </div>
                          <div className={cn("mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-5 text-subtext", !t.active && "opacity-50")}>
                            <span>{t.department ?? "كل الأقسام"}</span>
                            {!t.is_consumable && (
                              <span className="tabular-nums">· متاح {c["متاح"] ?? 0} / إجمالي {itemsOf(t.id).length}</span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  compact
                  icon={Hammer}
                  message={tools.length ? "مفيش أدوات مطابقة للبحث" : "مفيش أدوات"}
                  action={search
                    ? <button onClick={() => setSearch("")} className="eg-btn-ghost eg-btn-sm">مسح البحث</button>
                    : newToolButton}
                />
              )}
            </div>
          </div>

          {/* ═══ تفاصيل الأداة ═══ */}
          <div className="lg:col-span-7">
            {selected ? (
              <div key={selected.id} className="animate-fade-in space-y-4">
                <div className="eg-card !p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-bold leading-7 text-text">{selected.name}</h2>
                        <TypeBadge consumable={selected.is_consumable} />
                        {!selected.active && <Badge label="متعطلة" tone="danger" dot={false} />}
                      </div>
                      <p className="mt-0.5 text-xs leading-5 text-subtext">
                        {selected.is_consumable ? "أداة مستهلكة — بتتصرف بالكمية" : "أداة قابلة لإعادة الاستخدام — كل قطعة برقم تسلسلي"}
                        {" · "}{selected.department ? `قسم ${selected.department}` : "كل الأقسام"}
                        {selected.category ? ` · ${selected.category}` : ""}
                      </p>
                    </div>
                    <button type="button" onClick={() => toggleActive(selected)} disabled={toggling}
                      className={selected.active ? "eg-btn-danger-soft eg-btn-xs" : "eg-btn-ghost eg-btn-xs"}>
                      {toggling
                        ? <Spinner className="size-3" />
                        : selected.active ? <PowerOff className="size-3" /> : <Power className="size-3" />}
                      {selected.active ? "تعطيل" : "تفعيل"}
                    </button>
                  </div>
                </div>

                {!selected.is_consumable && (
                  <div className="eg-stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label="متاح" value={sel["متاح"] ?? 0} tone="success" />
                    <StatCard label="مع فني" value={sel["مع فني"] ?? 0} tone="accent" />
                    <StatCard label="تالف" value={sel["تالف"] ?? 0} tone="warning" />
                    <StatCard label="مفقود" value={sel["مفقود"] ?? 0} tone="danger" />
                  </div>
                )}

                {!selected.is_consumable && (
                  <div className="eg-card space-y-3 !p-4">
                    <SectionHeader icon={ListPlus} title="إضافة قطع برقم تسلسلي" description="رقم في كل سطر (أو الصقه من إكسل)" />
                    <textarea value={serialsText} onChange={e => setSerialsText(e.target.value)} rows={3} dir="ltr"
                      aria-label="الأرقام التسلسلية"
                      className="eg-input resize-y font-mono text-xs leading-5" placeholder={"HM-001\nHM-002\nHM-003"} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] tabular-nums text-subtext">
                        {serialCount > 0 ? `${serialCount} رقم جاهز للإضافة` : ""}
                      </span>
                      <button type="button" onClick={addSerials} disabled={addingSerials || !serialsText.trim()}
                        className="eg-btn-primary eg-btn-sm">
                        {addingSerials ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
                        {addingSerials ? "جاري الإضافة..." : "إضافة القطع"}
                      </button>
                    </div>
                  </div>
                )}

                {!selected.is_consumable && (
                  <div className="eg-card overflow-hidden !p-0">
                    {selItems.length ? (
                      <div className="overflow-x-auto">
                        <table className="eg-table eg-table-compact">
                          <thead>
                            <tr>
                              <th>الرقم التسلسلي</th>
                              <th className="w-32">الحالة</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selItems.map(i => (
                              <tr key={i.id}>
                                <td className="font-mono text-text">{i.serial_no}</td>
                                <td><Badge label={i.status} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <EmptyState compact icon={Boxes} message="لسه مفيش قطع مسجلة لهذه الأداة" />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="eg-card">
                <EmptyState icon={MousePointerClick} message="اختار أداة من القائمة"
                  description="هتظهر هنا بيانات الأداة وحالة قطعها." />
              </div>
            )}
          </div>
        </div>
      </PageBody>

      {/* ═══ مودال أداة جديدة ═══ */}
      <Modal open={addOpen} onClose={closeAdd} title="أداة جديدة">
        <form onSubmit={addTool} className="space-y-4">
          <Field label="اسم الأداة" required>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="eg-input" placeholder="مثال: شاكوش 500 جم" autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="التصنيف">
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="eg-input" placeholder="مثال: يدوية" />
            </Field>
            <Field label="الوحدة">
              <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="eg-input" />
            </Field>
          </div>
          <Field label="النوع">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TYPE_OPTIONS.map(o => {
                const on = form.is_consumable === o.v;
                return (
                  <button key={String(o.v)} type="button" aria-pressed={on}
                    onClick={() => setForm(f => ({ ...f, is_consumable: o.v }))}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50",
                      on ? "border-accent/60 bg-accent/[0.08] ring-1 ring-accent/40" : "border-border bg-card2/60 hover:border-border-strong",
                    )}>
                    <span aria-hidden className={cn(
                      "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                      on ? "border-accent" : "border-border-strong",
                    )}>
                      {on && <span className="size-2 rounded-full bg-accent" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-text">{o.label}</span>
                      <span className="block text-[11px] leading-5 text-subtext">{o.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="القسم">
            <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="eg-select">
              <option value="">كل الأقسام</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <FormError>{error}</FormError>
          <button type="submit" disabled={saving || !form.name.trim()} className="eg-btn-primary w-full">
            {saving ? <Spinner /> : <Save className="size-4" />}
            {saving ? "جاري الحفظ..." : "حفظ الأداة"}
          </button>
        </form>
      </Modal>
    </Page>
  );
}
