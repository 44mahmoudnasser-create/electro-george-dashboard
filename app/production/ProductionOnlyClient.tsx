"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import EmptyState from "@/components/ui/EmptyState";
import { ChevronRight, LogOut, Search } from "lucide-react";

type Role = "sheet_worker" | "paint_worker";

// كل دور بيشتغل على تشيك واحد بس، وده بيتحكم في اللي بيتعرض واللي بيتقدر يتعدل
const ROLE_CONFIG: Record<Role, { key: "chk_sheet" | "chk_paint"; label: string }> = {
  sheet_worker: { key: "chk_sheet", label: "الصاج" },
  paint_worker: { key: "chk_paint", label: "الدهان" },
};

export default function ProductionOnlyClient({ wos, role }: {
  wos: { id: number; wo_number: string }[]; role: Role;
}) {
  const router = useRouter();
  const { key: checkKey, label: checkLabel } = ROLE_CONFIG[role];
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
    // بنجيب Qty/Description/Part No./Sheet Steel/Thickness + التشيك الخاص بيه بس
    const { data } = await supabase
      .from("wo_production_items")
      .select(`id, qty, description, part_no, sheet_steel, thickness, ${checkKey}`)
      .eq("work_order_id", wo.id)
      .order("id", { ascending: true });
    setItems(data ?? []);
    setLoading(false);
  };

  const toggleCheck = async (itemId: number, value: boolean) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, [checkKey]: value } : it)); // تحديث فوري
    const { error } = await supabase.from("wo_production_items").update({ [checkKey]: value }).eq("id", itemId);
    if (error) {
      alert(error.message);
      setItems(prev => prev.map(it => it.id === itemId ? { ...it, [checkKey]: !value } : it)); // رجوع لو فشل
    }
  };

  const filteredWOs = wos.filter(w => !search || w.wo_number.includes(search));

  return (
    <div className="min-h-screen bg-bg">
      {/* Header بسيط - من غير أي Nav */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <h1 className="font-bold text-text">🏭 قائمة الإنتاج — {checkLabel}</h1>
        <button onClick={logout} className="eg-btn-ghost text-sm">
          <LogOut className="w-4 h-4" />خروج
        </button>
      </div>

      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
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
                <table className="eg-table">
                  <thead><tr>
                    <th>Qty</th><th>Description</th><th>Part No.</th><th>Sheet Steel</th><th>Thickness</th><th>{checkLabel}</th>
                  </tr></thead>
                  <tbody>{items.map(it => (
                    <tr key={it.id}>
                      <td>{it.qty}</td>
                      <td className="text-text">{it.description}</td>
                      <td className="font-mono text-accent">{it.part_no ?? "—"}</td>
                      <td>{it.sheet_steel ?? "—"}</td>
                      <td>{it.thickness ?? "—"}</td>
                      <td className="text-center">
                        <input type="checkbox" checked={!!it[checkKey]}
                          onChange={e => toggleCheck(it.id, e.target.checked)}
                          className="w-5 h-5 accent-emerald-500 cursor-pointer" />
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <EmptyState message="لا توجد بنود في قائمة الإنتاج لهذا الأمر" />}
          </>
        )}
      </div>
    </div>
  );
}
