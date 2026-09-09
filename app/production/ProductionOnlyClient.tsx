"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import EmptyState from "@/components/ui/EmptyState";
import { ChevronRight, LogOut, Search, ArrowUpDown } from "lucide-react";

type Role = "sheet_worker" | "paint_worker";

// كل دور بيقدر يعدل تشيك واحد بس، لكن بيشوف التلاتة
const ROLE_EDITABLE_KEY: Record<Role, "chk_sheet" | "chk_paint"> = {
  sheet_worker: "chk_sheet",
  paint_worker: "chk_paint",
};
const PROD_CHECKS = [
  { key: "chk_sheet",    label: "الصاج" },
  { key: "chk_paint",    label: "الدهان" },
  { key: "chk_assembly", label: "التجميع" },
] as const;

export default function ProductionOnlyClient({ wos, role }: {
  wos: { id: number; wo_number: string }[]; role: Role;
}) {
  const router = useRouter();
  const editableKey = ROLE_EDITABLE_KEY[role];
  const [search, setSearch] = useState("");
  const [selectedWO, setSelectedWO] = useState<{ id: number; wo_number: string } | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const openWO = async (wo: { id: number; wo_number: string }) => {
    setSelectedWO(wo);
    setLoading(true);
    // بنجيب Qty/Description/Part No./Sheet Steel/Thickness + التلات تشيك كلهم (يشوفهم كلهم، يعدل بتاعه بس)
    const { data } = await supabase
      .from("wo_production_items")
      .select("id, qty, description, part_no, sheet_steel, thickness, chk_sheet, chk_paint, chk_assembly")
      .eq("work_order_id", wo.id)
      .order("id", { ascending: true });
    setItems(data ?? []);
    setLoading(false);
  };

  const toggleCheck = async (itemId: number, key: string, value: boolean) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, [key]: value } : it)); // تحديث فوري
    const { error } = await supabase.from("wo_production_items").update({ [key]: value }).eq("id", itemId);
    if (error) {
      alert(error.message);
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, [key]: !value } : it)); // رجوع لو فشل
    }
  };

  const filteredWOs = wos.filter(w => !search || w.wo_number.includes(search));

  // ---------- ترتيب قائمة الإنتاج بأي عمود (زي Sheet Steel كنوع/فئة الخامة) ----------
  const SORT_COLS = [
    { key: "qty", label: "Qty" },
    { key: "description", label: "Description" },
    { key: "part_no", label: "Part No." },
    { key: "sheet_steel", label: "Sheet Steel" },
    { key: "thickness", label: "Thickness" },
  ] as const;
  const [sortCol, setSortCol] = useState<string>("id");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("asc");

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (sortCol === "qty") {
        const diff = (a.qty ?? 0) - (b.qty ?? 0);
        return sortDir === "asc" ? diff : -diff;
      }
      if (sortCol === "chk_sheet" || sortCol === "chk_paint" || sortCol === "chk_assembly") {
        const diff = Number(!!a[sortCol]) - Number(!!b[sortCol]);
        return sortDir === "asc" ? diff : -diff;
      }
      const av = String(a[sortCol] ?? "");
      const bv = String(b[sortCol] ?? "");
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [items, sortCol, sortDir]);

  return (
    <div className="min-h-screen bg-bg">
      {/* Header بسيط - من غير أي Nav */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <h1 className="font-bold text-text">🏭 قائمة الإنتاج</h1>
        <button onClick={logout} className="eg-btn-ghost text-sm">
          <LogOut className="w-4 h-4" />خروج
        </button>
      </div>

      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
        {!selectedWO ? (
          <>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="eg-input pr-9 w-full" placeholder="بحث برقم الأمر" />
            </div>
            <div className="eg-card divide-y divide-border/50">
              {filteredWOs.map(w => (
                <button key={w.id} onClick={() => openWO(w)}
                  className="w-full text-right p-4 hover:bg-card2 transition-colors font-mono text-accent font-semibold flex items-center justify-between">
                  {w.wo_number}
                  <ChevronRight className="w-4 h-4 rotate-180 text-subtext" />
                </button>
              ))}
              {filteredWOs.length === 0 && <EmptyState />}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => { setSelectedWO(null); setItems([]); }} className="eg-btn-ghost text-sm">
              <ChevronRight className="w-4 h-4" />رجوع لقائمة الأوامر
            </button>
            <h2 className="font-mono font-bold text-text text-lg">{selectedWO.wo_number}</h2>

            {loading ? (
              <div className="text-center py-8 text-subtext text-sm">جاري التحميل...</div>
            ) : items.length ? (
              <div className="eg-card overflow-x-auto">
                <table className="eg-table w-full min-w-[820px]">
                  <thead><tr>
                    {SORT_COLS.map(c => (
                      <th key={c.key} className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(c.key)}>
                        <div className="flex items-center gap-1 justify-center">
                          {c.label}<ArrowUpDown className="w-3 h-3 opacity-50" />
                        </div>
                      </th>
                    ))}
                    {PROD_CHECKS.map(c => (
                      <th key={c.key} className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(c.key)}>
                        <div className="flex items-center gap-1 justify-center">
                          {c.label}<ArrowUpDown className="w-3 h-3 opacity-50" />
                        </div>
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>{sortedItems.map(it => (
                    <tr key={it.id}>
                      <td className="whitespace-nowrap">{it.qty}</td>
                      <td className="text-text">{it.description}</td>
                      <td className="font-mono text-accent whitespace-nowrap">{it.part_no ?? "—"}</td>
                      <td className="whitespace-nowrap">{it.sheet_steel ?? "—"}</td>
                      <td className="whitespace-nowrap">{it.thickness ?? "—"}</td>
                      {PROD_CHECKS.map(c => {
                        const editable = c.key === editableKey;
                        const value = !!it[c.key];
                        return (
                          <td key={c.key} className="text-center">
                            {editable ? (
                              <input type="checkbox" checked={value}
                                onChange={e => toggleCheck(it.id, c.key, e.target.checked)}
                                className="w-5 h-5 accent-emerald-500 cursor-pointer" />
                            ) : (
                              <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                                value ? "bg-success/15 text-success" : "bg-card2 text-subtext"}`}>
                                {value ? "✅ تم" : "⬜ لسه"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              </div>
            ) : <EmptyState message="لا توجد بنود في قائمة الإنتاج لهذا الأمر" />}
          </>
        )}
      </div>
    </div>
  );
}
