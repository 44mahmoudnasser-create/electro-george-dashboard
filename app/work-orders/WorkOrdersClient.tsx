"use client";
import { useState, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { today, cn } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Search, ArrowUpDown, ChevronLeft } from "lucide-react";

const STATUSES = ["لم يبدأ", "جاري", "متوقف", "مكتمل", "تم التسليم"] as const;
const PRIORITIES = ["منخفضة", "متوسطة", "عالية", "عاجلة"] as const;
const DONE = ["مكتمل", "تم التسليم"];
const PRIORITY_STYLE: Record<string, string> = {
  "عاجلة": "bg-danger/15 text-danger",
  "عالية": "bg-warning/15 text-warning",
  "متوسطة": "bg-accent/15 text-accent",
  "منخفضة": "bg-card2 text-subtext",
};

type WO = {
  id: number; wo_number: string; status: string; priority: string | null; plan_month: string | null;
  department: string | null; created_date: string | null; expected_delivery: string | null;
  completion_date: string | null; chk_client: boolean | null; chk_quality: boolean | null; chk_assembly: boolean | null;
};
type SortCol = "wo_number" | "status" | "created_date" | "expected_delivery" | "completion_date";

const EMPTY_FORM = { wo_number: "", status: "لم يبدأ", expected_delivery: "", priority: "متوسطة", plan_month: "" };

export default function WorkOrdersClient({ initialWOs, role }: { initialWOs: WO[]; role: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const todayStr = today();

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
      (!search || w.wo_number.toLowerCase().includes(search.toLowerCase())) &&
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

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const addWO = async () => {
    if (!form.wo_number.trim()) return;
    setSaving(true); setError("");
    const { data, error: e } = await supabase.from("work_orders")
      .insert({
        wo_number: form.wo_number.trim(),
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
    setAddOpen(false);
    setForm(EMPTY_FORM);
    router.push(`${pathname}/${data.id}`);
  };

  const SortTh = ({ col, label, className }: { col: SortCol; label: string; className?: string }) => (
    <th className={cn("px-3 py-2 font-semibold cursor-pointer select-none whitespace-nowrap", className)}
      onClick={() => toggleSort(col)}>
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn("w-3 h-3", sortCol === col ? "text-accent" : "opacity-40")} />
      </span>
    </th>
  );

  return (
    <div className="max-w-7xl mx-auto">
      {/* شريط علوي ثابت */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border/60 px-4 md:px-6 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-text">أوامر الشغل</h1>
            <span className="text-xs text-subtext tabular-nums">{visible.length} / {wos.length}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtext" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                className="eg-input !py-1.5 !text-xs pr-8 w-48" placeholder="بحث برقم الأمر" />
            </div>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
              className="eg-select !py-1.5 !text-xs w-32">
              <option value="الكل">كل الأولويات</option>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
            <button onClick={() => setHideDone(v => !v)}
              className={cn("px-3 py-1.5 rounded-md border text-xs transition-colors",
                hideDone ? "bg-accent/15 border-accent/60 text-accent" : "bg-card2 border-border text-subtext hover:text-text")}>
              إخفاء المنتهي
            </button>
            <button onClick={() => setAddOpen(true)} className="eg-btn-primary !py-1.5 !text-xs">
              <Plus className="w-3.5 h-3.5" />أمر شغل جديد
            </button>
          </div>
        </div>

        {/* فلتر الحالات بعدادات */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {[
            { key: "الكل", label: "الكل", n: counts.all },
            ...STATUSES.map(s => ({ key: s, label: s, n: counts[s] ?? 0 })),
            { key: "متأخر", label: "متأخر", n: counts.late, warn: true },
          ].map(({ key, label, n, warn }) => {
            const active = filterStatus === key;
            return (
              <button key={key} onClick={() => setFilterStatus(key)}
                className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs whitespace-nowrap border transition-colors",
                  active ? "bg-accent/15 border-accent/60 text-accent font-semibold"
                    : "bg-card2 border-border text-subtext hover:text-text")}>
                {label}
                <span className={cn("tabular-nums text-[11px]", warn && n > 0 ? "text-danger" : "opacity-70")}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 md:p-6">
        <div className="eg-card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[860px]">
              <thead>
                <tr className="bg-card2 text-subtext">
                  <SortTh col="wo_number" label="رقم الأمر" className="text-right" />
                  <SortTh col="status" label="الحالة" className="text-right" />
                  <th className="px-3 py-2 text-right font-semibold">الأولوية</th>
                  <th className="px-3 py-2 text-right font-semibold">شهر الخطة</th>
                  <SortTh col="created_date" label="الإنشاء" className="text-right" />
                  <SortTh col="expected_delivery" label="التسليم المتوقع" className="text-right" />
                  <SortTh col="completion_date" label="الإتمام" className="text-right" />
                  <th className="px-3 py-2 text-center font-semibold">التحقق</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {visible.map(w => {
                  const late = isLate(w);
                  return (
                    <tr key={w.id} onClick={() => router.push(`${pathname}/${w.id}`)}
                      className="border-t border-border/40 cursor-pointer hover:bg-card2/50 group">
                      <td className="px-3 py-2 font-mono font-semibold text-accent">{w.wo_number}</td>
                      <td className="px-3 py-2"><Badge label={w.status} /></td>
                      <td className="px-3 py-2">
                        {w.priority ? (
                          <span className={cn("px-1.5 py-0.5 rounded text-[11px]", PRIORITY_STYLE[w.priority] ?? PRIORITY_STYLE["منخفضة"])}>
                            {w.priority}
                          </span>
                        ) : <span className="text-subtext">—</span>}
                      </td>
                      <td className="px-3 py-2 text-subtext tabular-nums">{w.plan_month ?? "—"}</td>
                      <td className="px-3 py-2 text-subtext tabular-nums">{w.created_date ?? "—"}</td>
                      <td className={cn("px-3 py-2 tabular-nums", late ? "text-danger font-semibold" : "text-subtext")}>
                        {w.expected_delivery ?? "—"}{late && <span className="mr-1 text-[10px]">· متأخر</span>}
                      </td>
                      <td className="px-3 py-2 text-subtext tabular-nums">{w.completion_date ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1" title="استلم العميل · الجودة · التجميع الكهربي">
                          <Dot on={!!w.chk_client} />
                          <Dot on={!!w.chk_quality} />
                          <Dot on={!!w.chk_assembly} />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-subtext group-hover:text-accent">
                        <ChevronLeft className="w-4 h-4" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <EmptyState message="لا توجد أوامر شغل مطابقة للفلتر" />}
        </div>
      </div>

      {/* مودال الإضافة */}
      <Modal open={addOpen} onClose={() => { setAddOpen(false); setError(""); }} title="أمر شغل جديد">
        <div className="space-y-4">
          <div>
            <label className="eg-label">رقم أمر الشغل *</label>
            <input value={form.wo_number} onChange={e => setForm(f => ({ ...f, wo_number: e.target.value }))}
              className="eg-input font-mono" placeholder="مثال: WO-2026-001" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eg-label">الحالة</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="eg-select">
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="eg-label">الأولوية</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="eg-select">
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="eg-label">التسليم المتوقع</label>
              <input type="date" value={form.expected_delivery}
                onChange={e => setForm(f => ({ ...f, expected_delivery: e.target.value }))} className="eg-input" />
            </div>
            <div>
              <label className="eg-label">شهر الخطة</label>
              <input type="month" value={form.plan_month}
                onChange={e => setForm(f => ({ ...f, plan_month: e.target.value }))} className="eg-input" />
            </div>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={addWO} disabled={saving || !form.wo_number.trim()} className="eg-btn-primary w-full justify-center">
            {saving ? "جاري الحفظ..." : "حفظ وفتح الأمر"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Dot({ on }: { on: boolean }) {
  return <span className={cn("w-2 h-2 rounded-full", on ? "bg-success" : "bg-border")} />;
}
