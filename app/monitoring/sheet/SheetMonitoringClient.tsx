"use client";
import { useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { Search, Settings, Plus } from "lucide-react";

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

const getWoNumber = (it: QueueItem) =>
  Array.isArray(it.work_order) ? it.work_order[0]?.wo_number : it.work_order?.wo_number;
const getWoStatus = (it: QueueItem) =>
  Array.isArray(it.work_order) ? it.work_order[0]?.status : it.work_order?.status;

export default function SheetMonitoringClient({
  initialItems, initialMachines, machineRequired, role,
}: {
  initialItems: QueueItem[]; initialMachines: Machine[]; machineRequired: boolean; role: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [machines, setMachines] = useState(initialMachines);
  const [search, setSearch] = useState("");
  const [woFilter, setWoFilter] = useState("الكل");
  const [materialFilter, setMaterialFilter] = useState("الكل");
  const [thicknessFilter, setThicknessFilter] = useState("الكل");
  const [machinesOpen, setMachinesOpen] = useState(false);

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

  // ---------- تسجيل إنتاج ----------
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
            <th className="w-24">المطلوب</th>
            <th className="w-24">المنتج</th>
            <th className="w-24">المتبقي</th>
            <th className="w-24">إجراء</th>
          </tr></thead>
          <tbody>
            {filtered.map(it => {
              const remaining = (it.qty ?? 0) - (it.qty_sheet ?? 0);
              return (
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
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState message="لا توجد بنود متبقية مطابقة للفلتر" />}
      </div>

      {/* مودال تسجيل الإنتاج */}
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
