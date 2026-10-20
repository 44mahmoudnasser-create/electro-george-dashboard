"use client";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Search, Save } from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = {
  id: number; name: string; category: string | null; is_consumable: boolean; unit: string;
  department: string | null; active: boolean;
};
type Item = { id: number; tool_id: number; serial_no: string; status: string; notes: string | null };

const ITEM_STATUS_STYLE: Record<string, string> = {
  "متاح": "bg-success/15 text-success",
  "مع فني": "bg-accent/15 text-accent",
  "تالف": "bg-warning/15 text-warning",
  "مفقود": "bg-danger/15 text-danger",
};

export default function ToolsClient({
  initialTools, initialItems, departments,
}: {
  initialTools: Tool[]; initialItems: Item[]; departments: string[];
}) {
  const [tools, setTools] = useState<Tool[]>(initialTools);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [selectedId, setSelectedId] = useState<number | null>(initialTools[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const flash = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    setTimeout(() => setNotice(null), 3500);
  };

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
  const emptyForm = { name: "", category: "", is_consumable: false, unit: "عدد", department: "" };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addTool = async () => {
    if (!form.name.trim()) return;
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
    setAddOpen(false); setForm(emptyForm);
    flash(true, `تمت إضافة ${data.name}`);
  };

  const toggleActive = async (t: Tool) => {
    const { error: e } = await supabase.from("tools").update({ active: !t.active }).eq("id", t.id);
    if (e) { flash(false, e.message); return; }
    setTools(prev => prev.map(x => x.id === t.id ? { ...x, active: !t.active } : x));
  };

  /* ─────────── أرقام تسلسلية ─────────── */
  const [serialsText, setSerialsText] = useState("");
  const [addingSerials, setAddingSerials] = useState(false);

  const addSerials = async () => {
    if (!selected) return;
    const serials = serialsText.split(/\r?\n|,|\t/).map(s => s.trim()).filter(Boolean);
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

  return (
    <div className="max-w-6xl mx-auto">
      {/* شريط علوي ثابت */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border/60 px-4 md:px-6 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-text">الأدوات</h1>
            <span className="text-xs text-subtext tabular-nums">{tools.length} أداة</span>
          </div>
          <button onClick={() => setAddOpen(true)} className="eg-btn-primary !py-1.5 !text-xs">
            <Plus className="w-3.5 h-3.5" />أداة جديدة
          </button>
        </div>
      </div>

      {notice && (
        <div className="px-4 md:px-6 pt-3">
          <div className={cn("text-xs px-3 py-2 rounded-lg border",
            notice.ok ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger")}>
            {notice.text}
          </div>
        </div>
      )}

      <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ═══ الكتالوج ═══ */}
        <div className="lg:col-span-5 space-y-2">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtext" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="eg-input !py-1.5 !text-xs pr-8 w-full" placeholder="بحث باسم الأداة" />
          </div>
          <div className="eg-card !p-0 overflow-hidden divide-y divide-border/40">
            {filtered.map(t => {
              const c = countBy(t.id);
              const active = t.id === selectedId;
              return (
                <button key={t.id} onClick={() => setSelectedId(t.id)}
                  className={cn("w-full text-right px-4 py-2.5 transition-colors",
                    active ? "bg-accent/10" : "hover:bg-card2/50", !t.active && "opacity-50")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text">{t.name}</span>
                    <span className="text-[10px] text-subtext">{t.is_consumable ? "مستهلكة" : "إعادة استخدام"}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-subtext">
                    <span>{t.department ?? "كل الأقسام"}</span>
                    {!t.is_consumable && (
                      <span className="tabular-nums">· متاح {c["متاح"] ?? 0} / إجمالي {itemsOf(t.id).length}</span>
                    )}
                    {!t.active && <span className="text-danger">· متعطلة</span>}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <EmptyState message="مفيش أدوات" />}
          </div>
        </div>

        {/* ═══ تفاصيل الأداة ═══ */}
        <div className="lg:col-span-7 space-y-4">
          {selected ? (
            <>
              <div className="eg-card !p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-text">{selected.name}</h2>
                    <p className="text-xs text-subtext mt-0.5">
                      {selected.is_consumable ? "أداة مستهلكة — بتتصرف بالكمية" : "أداة قابلة لإعادة الاستخدام — كل قطعة برقم تسلسلي"}
                      {" · "}{selected.department ? `قسم ${selected.department}` : "كل الأقسام"}
                      {selected.category ? ` · ${selected.category}` : ""}
                    </p>
                  </div>
                  <button onClick={() => toggleActive(selected)}
                    className={cn("text-xs hover:underline", selected.active ? "text-danger" : "text-success")}>
                    {selected.active ? "تعطيل" : "تفعيل"}
                  </button>
                </div>

                {!selected.is_consumable && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {["متاح", "مع فني", "تالف", "مفقود"].map(s => (
                      <div key={s} className="bg-card2 rounded-lg px-3 py-2">
                        <div className="text-lg font-bold tabular-nums text-text">{sel[s] ?? 0}</div>
                        <div className="text-[11px] text-subtext">{s}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {!selected.is_consumable && (
                <div className="eg-card !p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-text">إضافة قطع برقم تسلسلي</p>
                    <p className="text-[11px] text-subtext">رقم في كل سطر (أو الصقه من إكسل)</p>
                  </div>
                  <textarea value={serialsText} onChange={e => setSerialsText(e.target.value)} rows={3}
                    className="eg-input !text-xs font-mono" placeholder={"HM-001\nHM-002\nHM-003"} />
                  <button onClick={addSerials} disabled={addingSerials || !serialsText.trim()}
                    className="eg-btn-primary !py-1.5 !text-xs">
                    <Save className="w-3.5 h-3.5" />{addingSerials ? "جاري الإضافة..." : "إضافة القطع"}
                  </button>
                </div>
              )}

              {!selected.is_consumable && (
                <div className="eg-card !p-0 overflow-hidden">
                  {selItems.length ? (
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-card2 text-subtext">
                          <th className="px-4 py-2 text-right font-semibold">الرقم التسلسلي</th>
                          <th className="px-3 py-2 text-right font-semibold">الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selItems.map(i => (
                          <tr key={i.id} className="border-t border-border/40 hover:bg-card2/50">
                            <td className="px-4 py-1.5 font-mono text-text">{i.serial_no}</td>
                            <td className="px-3 py-1.5">
                              <span className={cn("px-2 py-0.5 rounded text-[11px]", ITEM_STATUS_STYLE[i.status])}>{i.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <EmptyState message="لسه مفيش قطع مسجلة لهذه الأداة" />}
                </div>
              )}
            </>
          ) : (
            <div className="eg-card"><EmptyState message="اختار أداة من القائمة" /></div>
          )}
        </div>
      </div>

      {/* ═══ مودال أداة جديدة ═══ */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); setError(""); }} title="أداة جديدة">
        <div className="space-y-4">
          <div>
            <label className="eg-label">اسم الأداة *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="eg-input" placeholder="مثال: شاكوش 500 جم" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eg-label">التصنيف</label>
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="eg-input" placeholder="مثال: يدوية" />
            </div>
            <div>
              <label className="eg-label">الوحدة</label>
              <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="eg-input" />
            </div>
          </div>
          <div>
            <label className="eg-label">النوع</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: false, label: "قابلة لإعادة الاستخدام", hint: "برقم تسلسلي لكل قطعة" },
                { v: true, label: "مستهلكة", hint: "بالكمية، من غير رقم" },
              ].map(o => (
                <button key={String(o.v)} type="button" onClick={() => setForm(f => ({ ...f, is_consumable: o.v }))}
                  className={cn("text-right px-3 py-2 rounded-lg border transition-colors",
                    form.is_consumable === o.v ? "border-accent/60 bg-accent/10" : "border-border bg-card2 hover:border-border")}>
                  <div className="text-xs font-semibold text-text">{o.label}</div>
                  <div className="text-[11px] text-subtext">{o.hint}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="eg-label">القسم</label>
            <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="eg-select">
              <option value="">كل الأقسام</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={addTool} disabled={saving || !form.name.trim()} className="eg-btn-primary w-full justify-center">
            {saving ? "جاري الحفظ..." : "حفظ الأداة"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
