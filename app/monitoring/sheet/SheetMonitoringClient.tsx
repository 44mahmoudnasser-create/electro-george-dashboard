"use client";
import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { Search, Settings, Plus, ChevronDown, ChevronUp } from "lucide-react";

type QueueItem = {
  id: number;
  work_order_id: number;
  qty: number;
  description: string;
  part_no: string | null;
  sheet_steel: string | null;
  thickness: string | null;
  qty_sheet: number;
  work_order?: { wo_number: string; status: string } | { wo_number: string; status: string }[];
};

type Machine = { id: number; name: string; department: string; notes: string | null; active: boolean };
type Substage = { id: number; production_item_id: number; stage: string; qty_done: number };

const getWoNumber = (it: QueueItem) =>
  Array.isArray(it.work_order) ? it.work_order[0]?.wo_number : it.work_order?.wo_number;

// مراحل التصنيع الداخلية — اختيارية، خاصة بمتابعة قسم الصاج بس، وبتختلف من بارت للتاني
const SUBSTAGES = [
  { key: "punch", label: "البانش" },
  { key: "cut",   label: "المقص" },
  { key: "bend",  label: "التني" },
  { key: "weld",  label: "اللحام" },
] as const;

export default function SheetMonitoringClient({
  initialItems, initialMachines, initialSubstages, machineRequired, role,
}: {
  initialItems: QueueItem[]; initialMachines: Machine[]; initialSubstages: Substage[];
  machineRequired: boolean; role: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [machines, setMachines] = useState(initialMachines);
  const [substages, setSubstages] = useState(initialSubstages);
  const [search, setSearch] = useState("");
  const [woFilter, setWoFilter] = useState("الكل");
  const [materialFilter, setMaterialFilter] = useState("الكل");
  const [thicknessFilter, setThicknessFilter] = useState("الكل");
  const [machinesOpen, setMachinesOpen] = useState(false);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  // ---------- Queue: البنود اللي لسه الصاج ماخلصهاش (remaining > 0) ----------
  const queue = useMemo(() => items.filter(it => (it.qty ?? 0) - (it.qty_sheet ?? 0) > 0), [items]);

  const woOptions = useMemo(
    () => Array.from(new Set(queue.map(getWoNumber).filter(Boolean) as string[])).sort(),
    [queue]
  );
  const materialOptions = useMemo(
    () => Array.from(new Set(queue.map(it => it.sheet_steel).filter(Boolean) as string[])).sort(),
    [queue]
  );
  const thicknessOptions = useMemo(
    () => Array.from(new Set(queue.map(it => it.thickness).filter(Boolean) as string[])).sort(),
    [queue]
  );

  const filtered = useMemo(() => queue.filter(it => {
    if (woFilter !== "الكل" && getWoNumber(it) !== woFilter) return false;
    if (materialFilter !== "الكل" && it.sheet_steel !== materialFilter) return false;
    if (thicknessFilter !== "الكل" && it.thickness !== thicknessFilter) return false;
    if (search) {
      const hay = `${it.description} ${it.part_no ?? ""} ${getWoNumber(it) ?? ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [queue, woFilter, materialFilter, thicknessFilter, search]);

  const substagesFor = (itemId: number) =>
    SUBSTAGES.map(s => ({
      ...s,
      qty_done: substages.find(x => x.production_item_id === itemId && x.stage === s.key)?.qty_done ?? 0,
    }));

  // ---------- تسجيل الإنتاج الأساسي (بيحدد qty_sheet، بيفتح الدهان) ----------
  const [logItem, setLogItem] = useState<QueueItem | null>(null);
  const [logQty, setLogQty] = useState("");
  const [logMachineId, setLogMachineId] = useState("");
  const [logging, setLogging] = useState(false);

  const openLog = (it: QueueItem) => {
    setLogItem(it);
    setLogQty("");
    setLogMachineId("");
  };

  const submitLog = async () => {
    if (!logItem) return;
    const q = parseFloat(logQty);
    if (!q || q <= 0) { alert("أدخل كمية صحيحة"); return; }
    if (machineRequired && !logMachineId) { alert("اختيار المكنة إجباري"); return; }
    setLogging(true);
    const { error } = await supabase.rpc("log_production", {
      p_item_id: logItem.id,
      p_stage: "sheet",
      p_qty: q,
      p_machine_id: logMachineId ? parseInt(logMachineId) : null,
      p_note: null,
    });
    setLogging(false);
    if (error) { alert(error.message); return; }
    setItems(prev => prev.map(it =>
      it.id === logItem.id ? { ...it, qty_sheet: (it.qty_sheet ?? 0) + q } : it
    ));
    setLogItem(null);
  };

  // ---------- تسجيل المراحل الفرعية (اختياري، للمتابعة الداخلية بس) ----------
  const [subQty, setSubQty] = useState<Record<string, string>>({}); // key = `${itemId}-${stage}`
  const [subSaving, setSubSaving] = useState<string | null>(null);

  const submitSubstage = async (itemId: number, stage: string, targetQty: number) => {
    const k = `${itemId}-${stage}`;
    const q = parseFloat(subQty[k] ?? "");
    if (!q || q <= 0) { alert("أدخل كمية صحيحة"); return; }
    setSubSaving(k);
    const { error } = await supabase.rpc("log_substage", {
      p_item_id: itemId, p_stage: stage, p_qty: q,
    });
    setSubSaving(null);
    if (error) { alert(error.message); return; }
    setSubstages(prev => {
      const idx = prev.findIndex(x => x.production_item_id === itemId && x.stage === stage);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty_done: next[idx].qty_done + q };
        return next;
      }
      return [...prev, { id: Date.now(), production_item_id: itemId, stage, qty_done: q }];
    });
    setSubQty(prev => ({ ...prev, [k]: "" }));
  };

  // ---------- إدارة المكن ----------
  const [newMachineName, setNewMachineName] = useState("");
  const [addingMachine, setAddingMachine] = useState(false);

  const addMachine = async () => {
    if (!newMachineName.trim()) return;
    setAddingMachine(true);
    const { data, error } = await supabase.from("machines")
      .insert({ name: newMachineName.trim(), department: "SHEET" })
      .select("*")
      .single();
    setAddingMachine(false);
    if (error) { alert(error.message); return; }
    setMachines(prev => [...prev, data]);
    setNewMachineName("");
  };

  const toggleMachineActive = async (m: Machine) => {
    const { error } = await supabase.from("machines").update({ active: !m.active }).eq("id", m.id);
    if (error) { alert(error.message); return; }
    setMachines(prev => prev.map(x => x.id === m.id ? { ...x, active: !x.active } : x));
  };

  return (
    <div className="p-4 md:p-6 w-full mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">🛠️ متابعة قسم الصاج</h1>
          <p className="text-sm text-subtext mt-0.5">البنود المتبقية من كل أوامر الشغل، بدون التقيد بترتيب الأوردرات</p>
        </div>
        <button onClick={() => setMachinesOpen(true)} className="eg-btn-ghost text-sm">
          <Settings className="w-4 h-4" />إدارة المكن
        </button>
      </div>

      {/* كرت سريع */}
      <div className="eg-card flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold text-warning">{filtered.length}</div>
          <div className="text-xs text-subtext mt-1">بند في قائمة الانتظار (حسب الفلتر الحالي)</div>
        </div>
        <div className="text-left">
          <div className="text-2xl font-bold text-text">{queue.length}</div>
          <div className="text-xs text-subtext mt-1">إجمالي البنود المتبقية (كل الأوردرات)</div>
        </div>
      </div>

      {/* الفلاتر */}
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="eg-input pr-9 w-56" placeholder="بحث بالوصف أو رقم القطعة أو الأمر" />
        </div>
        <select value={woFilter} onChange={e => setWoFilter(e.target.value)} className="eg-select w-40">
          <option>الكل</option>
          {woOptions.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <select value={materialFilter} onChange={e => setMaterialFilter(e.target.value)} className="eg-select w-36">
          <option>الكل</option>
          {materialOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={thicknessFilter} onChange={e => setThicknessFilter(e.target.value)} className="eg-select w-32">
          <option>الكل</option>
          {thicknessOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* الجدول */}
      <div className="eg-card overflow-x-auto">
        <table className="eg-table w-full table-fixed">
          <thead><tr>
            <th className="w-28">أمر الشغل</th>
            <th className="w-auto">الوصف</th>
            <th className="w-24">Part No.</th>
            <th className="w-24">الخامة</th>
            <th className="w-20">السُمك</th>
            <th className="w-20">المطلوب</th>
            <th className="w-20">المنتج</th>
            <th className="w-20">المتبقي</th>
            <th className="w-24">إجراء</th>
            <th className="w-10"></th>
          </tr></thead>
          <tbody>
            {filtered.map(it => {
              const remaining = (it.qty ?? 0) - (it.qty_sheet ?? 0);
              const isExpanded = expandedItem === it.id;
              return (
                <>
                  <tr key={it.id}>
                    <td className="font-mono text-accent">{getWoNumber(it) ?? "—"}</td>
                    <td className="text-text whitespace-normal break-words">{it.description}</td>
                    <td className="font-mono">{it.part_no ?? "—"}</td>
                    <td>{it.sheet_steel ?? "—"}</td>
                    <td>{it.thickness ?? "—"}</td>
                    <td>{it.qty}</td>
                    <td className="text-text font-medium">{it.qty_sheet ?? 0}</td>
                    <td className="text-warning font-bold">{remaining}</td>
                    <td>
                      <button onClick={() => openLog(it)} className="eg-btn-primary text-xs !py-1.5">
                        تسجيل
                      </button>
                    </td>
                    <td>
                      <button onClick={() => setExpandedItem(isExpanded ? null : it.id)}
                        className="text-subtext hover:text-text" title="تفاصيل مراحل التصنيع (اختياري)">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={10} className="bg-card2/40 p-3">
                        <p className="text-xs text-subtext mb-2">
                          متابعة داخلية اختيارية لمراحل التصنيع (خاصة بالصاج فقط) — مش مرتبطة بفتح الدهان، وملهاش ترتيب إجباري، ومش كل بارت لازم يمر بيها كلها.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {substagesFor(it.id).map(s => {
                            const k = `${it.id}-${s.key}`;
                            return (
                              <div key={s.key} className="bg-card rounded-lg p-2 space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-text">{s.label}</span>
                                  <span className="text-xs text-subtext">{s.qty_done} / {it.qty}</span>
                                </div>
                                <div className="flex gap-1">
                                  <input type="number" min="0.01" step="any"
                                    value={subQty[k] ?? ""}
                                    onChange={e => setSubQty(prev => ({ ...prev, [k]: e.target.value }))}
                                    className="eg-input !py-1 !text-xs flex-1" placeholder="كمية" />
                                  <button
                                    onClick={() => submitSubstage(it.id, s.key, it.qty)}
                                    disabled={subSaving === k}
                                    className="eg-btn-ghost !py-1 !px-2 text-xs">
                                    {subSaving === k ? "..." : "+"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState message="لا توجد بنود متبقية مطابقة للفلتر" />}
      </div>

      {/* مودال تسجيل الإنتاج الأساسي */}
      <Modal open={!!logItem} onClose={() => setLogItem(null)} title="📝 تسجيل إنتاج صاج">
        {logItem && (
          <div className="space-y-4">
            <div className="bg-card2 rounded-lg p-3 text-sm">
              <p className="text-text font-medium">{logItem.description}</p>
              <p className="text-subtext text-xs mt-1">
                أمر الشغل: {getWoNumber(logItem) ?? "—"} —
                المنتج: {logItem.qty_sheet ?? 0} / {logItem.qty}
              </p>
            </div>
            <div>
              <label className="eg-label">الكمية المنجزة</label>
              <input type="number" min="0.01" step="any" value={logQty}
                onChange={e => setLogQty(e.target.value)} className="eg-input" autoFocus />
            </div>
            <div>
              <label className="eg-label">المكنة {machineRequired ? "*" : "(اختياري)"}</label>
              <select value={logMachineId} onChange={e => setLogMachineId(e.target.value)} className="eg-select">
                <option value="">— بدون تحديد —</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {machines.length === 0 && (
                <p className="text-xs text-subtext mt-1">لا توجد مكن مسجلة — أضفها من "إدارة المكن"</p>
              )}
            </div>
            <button onClick={submitLog} disabled={logging} className="eg-btn-success w-full justify-center">
              {logging ? "جاري التسجيل..." : "✅ تأكيد التسجيل"}
            </button>
          </div>
        )}
      </Modal>

      {/* مودال إدارة المكن */}
      <Modal open={machinesOpen} onClose={() => setMachinesOpen(false)} title="⚙️ إدارة مكن الصاج">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input value={newMachineName} onChange={e => setNewMachineName(e.target.value)}
              className="eg-input flex-1" placeholder="اسم المكنة الجديدة" />
            <button onClick={addMachine} disabled={addingMachine || !newMachineName.trim()} className="eg-btn-primary">
              <Plus className="w-4 h-4" />{addingMachine ? "..." : "إضافة"}
            </button>
          </div>
          <div className="space-y-2">
            {machines.map(m => (
              <div key={m.id} className="flex items-center justify-between bg-card2 rounded-lg px-3 py-2">
                <span className={`text-sm ${m.active ? "text-text" : "text-subtext line-through"}`}>{m.name}</span>
                <button onClick={() => toggleMachineActive(m)}
                  className={`text-xs hover:underline ${m.active ? "text-danger" : "text-success"}`}>
                  {m.active ? "تعطيل" : "تفعيل"}
                </button>
              </div>
            ))}
            {machines.length === 0 && <p className="text-xs text-subtext text-center py-3">لا توجد مكن مسجلة بعد</p>}
          </div>
        </div>
      </Modal>
    </div>
  );
}
