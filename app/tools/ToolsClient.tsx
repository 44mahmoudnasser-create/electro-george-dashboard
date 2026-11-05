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
import { Plus, Save, Hammer, Power, PowerOff, ListPlus, Boxes, MousePointerClick, PackageOpen } from "lucide-react";
import { HOLDERS_SELECT, flattenHolders, type Holder } from "@/lib/custody-holders";
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

type TechLite = { id: number; name: string; department: string | null };

export default function ToolsClient({
  initialTools, initialItems, initialHolders, technicians, departments,
}: {
  initialTools: Tool[]; initialItems: Item[]; initialHolders: Holder[];
  technicians: TechLite[]; departments: string[];
}) {
  const toast = useToast();
  const [tools, setTools] = useState<Tool[]>(initialTools);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [selectedId, setSelectedId] = useState<number | null>(initialTools[0]?.id ?? null);
  const [search, setSearch] = useState("");
  // العهد المفتوحة (مع الفنيين) — بتتحدث بعد أي صرف
  const [holders, setHolders] = useState<Holder[]>(initialHolders);
  const holdersOf = (toolId: number) => holders.filter(h => h.tool_id === toolId);

  // ─── تسجيل صرف الأداة لفني ───
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueTechId, setIssueTechId] = useState("");
  const [issueQty, setIssueQty] = useState("1");
  const [issueSerials, setIssueSerials] = useState<number[]>([]);
  const [issueNote, setIssueNote] = useState("");
  const [issueBusy, setIssueBusy] = useState(false);
  const [issueError, setIssueError] = useState("");

  const flash = (ok: boolean, text: string) => toast.show(ok, text);

  const selected = tools.find(t => t.id === selectedId) ?? null;
  const filtered = useMemo(
    () => tools.filter(t => !search || t.name.includes(search)),
    [tools, search]
  );

  const itemsOf = (toolId: number) => items.filter(i => i.tool_id === toolId);

  const fetchHolders = async () => {
    const { data } = await supabase.from("custody").select(HOLDERS_SELECT)
      .eq("status", "مستلمة").gt("open_qty", 0).order("issued_at");
    if (data) setHolders(flattenHolders(data));
  };

  const openIssue = () => {
    setIssueTechId(""); setIssueQty("1"); setIssueSerials([]); setIssueNote(""); setIssueError("");
    setIssueOpen(true);
  };

  const toggleIssueSerial = (id: number) =>
    setIssueSerials(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const submitIssue = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selected || issueBusy) return;
    if (!issueTechId) { setIssueError("اختار الفني"); return; }
    const consumable = selected.is_consumable;
    if (consumable && !(parseFloat(issueQty) > 0)) { setIssueError("أدخل كمية صحيحة"); return; }
    if (!consumable && issueSerials.length === 0) { setIssueError("اختار قطعة واحدة على الأقل"); return; }
    setIssueBusy(true); setIssueError("");
    const { data, error: e2 } = await supabase.rpc("issue_custody", {
      p_tech_id: Number(issueTechId),
      p_tool_id: selected.id,
      p_qty: consumable ? parseFloat(issueQty) : 1,
      p_serial_ids: consumable ? null : issueSerials,
      p_note: issueNote.trim() || null,
    });
    setIssueBusy(false);
    if (e2) { setIssueError(e2.message); return; }
    if (!consumable) {
      setItems(prev => prev.map(i => issueSerials.includes(i.id) ? { ...i, status: "مع فني" } : i));
    }
    await fetchHolders();
    const techName = technicians.find(t => String(t.id) === issueTechId)?.name ?? "";
    setIssueOpen(false);
    flash(true, `تم صرف ${data}${consumable ? "" : " قطعة"} لـ ${techName}`);
  };
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

                <div className="eg-card overflow-hidden !p-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                    <div>
                      <div className="text-sm font-bold text-text">مع الفنيين</div>
                      <div className="text-[11px] text-subtext">
                        {selected.is_consumable
                          ? `مصروف لسه مع الفنيين: ${holdersOf(selected.id).reduce((a, h) => a + h.open_qty, 0)} ${selected.unit}`
                          : `${holdersOf(selected.id).length} قطعة مع الفنيين · متاح ${sel["متاح"] ?? 0}`}
                      </div>
                    </div>
                    <button type="button" onClick={openIssue} className="eg-btn-primary eg-btn-sm">
                      <PackageOpen className="size-3.5" />تسجيل صرف
                    </button>
                  </div>
                  {holdersOf(selected.id).length ? (
                    <div className="overflow-x-auto">
                      <table className="eg-table eg-table-compact">
                        <thead>
                          <tr>
                            <th>الفني</th>
                            <th>القسم</th>
                            <th>{selected.is_consumable ? "الكمية" : "الرقم التسلسلي"}</th>
                            <th className="w-32">تاريخ الصرف</th>
                          </tr>
                        </thead>
                        <tbody>
                          {holdersOf(selected.id).map(h => (
                            <tr key={h.id}>
                              <td className="font-medium text-text">{h.tech_name}</td>
                              <td className="text-subtext">{h.tech_dept ?? "—"}</td>
                              <td className={selected.is_consumable ? "tabular-nums" : "font-mono text-text"}>
                                {selected.is_consumable ? `${h.open_qty} ${selected.unit}` : h.serial_no}
                              </td>
                              <td className="tabular-nums text-subtext">{h.issued_at}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState compact icon={PackageOpen} message="مفيش حد معاه الأداة دي دلوقتي" />
                  )}
                </div>

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

      {/* ═══ مودال تسجيل صرف ═══ */}
      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title={selected ? `صرف ${selected.name}` : "صرف أداة"} size="sm">
        <form onSubmit={submitIssue} className="space-y-4">
          <Field label="الفني" required htmlFor="issue-tech">
            <select id="issue-tech" value={issueTechId} onChange={e => setIssueTechId(e.target.value)} className="eg-select">
              <option value="">— اختار —</option>
              {technicians.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.department ? ` · ${t.department}` : ""}</option>
              ))}
            </select>
          </Field>

          {selected?.is_consumable ? (
            <Field label={`الكمية (${selected.unit})`} required htmlFor="issue-qty">
              <input id="issue-qty" type="number" min="0" step="any" value={issueQty}
                onChange={e => setIssueQty(e.target.value)} className="eg-input" />
            </Field>
          ) : (
            <Field label="القطع المتاحة" required hint="اختار القطع اللي هتتصرف">
              {selected && itemsOf(selected.id).filter(i => i.status === "متاح").length ? (
                <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-border/60 p-2">
                  {itemsOf(selected.id).filter(i => i.status === "متاح").map(i => (
                    <label key={i.id} className="flex cursor-pointer items-center gap-2 font-mono text-xs text-text">
                      <input type="checkbox" checked={issueSerials.includes(i.id)} onChange={() => toggleIssueSerial(i.id)} />
                      {i.serial_no}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-subtext">مفيش قطع متاحة للصرف</p>
              )}
            </Field>
          )}

          <Field label="ملاحظة" htmlFor="issue-note">
            <input id="issue-note" value={issueNote} onChange={e => setIssueNote(e.target.value)} className="eg-input" />
          </Field>

          <FormError>{issueError}</FormError>
          <button type="submit" disabled={issueBusy} className="eg-btn-primary w-full justify-center">
            {issueBusy && <Spinner className="size-3.5" />}
            {issueBusy ? "جاري الصرف..." : "تأكيد الصرف"}
          </button>
        </form>
      </Modal>

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
