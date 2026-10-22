"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import EmptyState from "@/components/ui/EmptyState";
import { ChevronRight, Plus, Save, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = { description: string; qty: string; unit: string; part_no: string; remark: string };
type SavedRow = { id: number; s_no: number | null; qty: number; unit: string | null; description: string; part_no: string | null; remark: string | null };
const EMPTY: Row = { description: "", qty: "1", unit: "", part_no: "", remark: "" };
const COLS = ["description", "qty", "unit", "part_no", "remark"] as const;

export default function TotalBomClient({
  wo, initialRows, canWrite,
}: {
  wo: { id: number; wo_number: string; client_name: string | null; project_name: string | null };
  initialRows: SavedRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedRow[]>(initialRows);
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY }]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const locked = saved.length > 0;

  const flash = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    setTimeout(() => setNotice(null), 3500);
  };

  const update = (i: number, patch: Partial<Row>) =>
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // لصق من Excel: كل سطر بيتحول لصف، وكل عمود بيتحط في الخانة الصح
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;   // لصق عادي من غير جدول
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
    setRows(prev => {
      const next = [...prev];
      lines.forEach((line, k) => {
        let cells = line.split("\t").map(c => c.trim());
        // لو الجدول جاي بعمود S.NO في الأول (6 أعمدة) نشيله
        if (cells.length === 6 && /^\d+$/.test(cells[0])) cells = cells.slice(1);
        const t = rowIdx + k;
        while (next.length <= t) next.push({ ...EMPTY });
        const row: any = { ...next[t] };
        cells.forEach((val, j) => {
          const col = COLS[colIdx + j];
          if (col) row[col] = val;
        });
        next[t] = row;
      });
      return next;
    });
    flash(true, `اتلصق ${lines.length} سطر`);
  };

  const save = async () => {
    const payload = rows
      .filter(r => r.description.trim())
      .map((r, idx) => ({
        s_no: idx + 1,
        description: r.description.trim(),
        qty: parseFloat(r.qty) || 1,
        unit: r.unit.trim() || null,
        part_no: r.part_no.trim() || null,
        remark: r.remark.trim() || null,
      }));
    if (payload.length === 0) { flash(false, "اكتب سطر واحد على الأقل"); return; }

    setSaving(true);
    const { data, error } = await supabase.rpc("set_total_bom", { p_wo_id: wo.id, p_rows: payload });
    setSaving(false);
    if (error) { flash(false, error.message); return; }

    // نجيب الصفوف المحفوظة من الداتابيز
    const { data: fresh } = await supabase.from("wo_total_bom").select("*").eq("wo_id", wo.id)
      .order("s_no", { ascending: true, nullsFirst: false });
    setSaved((fresh ?? []) as SavedRow[]);
    setRows([{ ...EMPTY }]);
    flash(true, `تم حفظ Total BOM (${(data as { rows: number }).rows} سطر) — مقفول`);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* هيدر */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border/60 px-4 md:px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => router.push(`/work-orders/${wo.id}`)} className="eg-btn-ghost !py-1.5 !px-2.5 !text-xs">
            <ChevronRight className="w-3.5 h-3.5" />الأمر
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-text">Total BOM</h1>
            <p className="text-xs text-subtext font-mono">{wo.wo_number}
              {wo.client_name ? ` · ${wo.client_name}` : ""}{wo.project_name ? ` · ${wo.project_name}` : ""}
            </p>
          </div>
          {locked && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-card2 text-subtext">
              <Lock className="w-3 h-3" />مقفول
            </span>
          )}
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {notice && (
          <div className={cn("text-xs px-3 py-2 rounded-lg border",
            notice.ok ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger")}>
            {notice.text}
          </div>
        )}

        {/* ── محفوظ ── */}
        {locked ? (
          <div className="eg-card !p-0 overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[520px]">
              <thead><tr className="bg-card2 text-subtext">
                <th className="px-3 py-2 text-center font-semibold w-12">#</th>
                <th className="px-3 py-2 text-right font-semibold">الوصف</th>
                <th className="px-3 py-2 text-center font-semibold w-24">الكمية</th>
                <th className="px-3 py-2 text-center font-semibold w-24">الوحدة</th>
                <th className="px-3 py-2 text-right font-semibold w-32">رقم الصنف</th>
                <th className="px-3 py-2 text-right font-semibold">ملاحظة</th>
              </tr></thead>
              <tbody>
                {saved.map((r, i) => (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="px-3 py-1.5 text-center tabular-nums text-subtext">{i + 1}</td>
                    <td className="px-3 py-1.5 text-text">{r.description}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums">{r.qty}</td>
                    <td className="px-3 py-1.5 text-center">{r.unit ?? "—"}</td>
                    <td className="px-3 py-1.5 font-mono text-subtext">{r.part_no ?? "—"}</td>
                    <td className="px-3 py-1.5 text-subtext">{r.remark ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="eg-card"><EmptyState message={canWrite ? "لم يُكتب Total BOM لهذا الأمر بعد" : "لم يُكتب Total BOM لهذا الأمر بعد"} /></div>
        )}

        {/* ── كتابة (مرة واحدة) ── */}
        {!locked && canWrite && (
          <div className="eg-card !p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-text">كتابة Total BOM</h2>
              <span className="text-[10px] text-warning">بعد الحفظ هيتقفل نهائياً · تقدر تلصق جدول كامل من Excel في أي خانة</span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 md:col-span-4">
                  <label className="block text-[11px] text-subtext mb-1">الوصف</label>
                  <input value={r.description} onChange={e => update(i, { description: e.target.value })} onPaste={e => handlePaste(e, i, 0)} className="eg-input !py-1.5 !text-xs" />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <label className="block text-[11px] text-subtext mb-1">الكمية</label>
                  <input type="number" min="0.01" step="any" value={r.qty} onChange={e => update(i, { qty: e.target.value })} onPaste={e => handlePaste(e, i, 1)} className="eg-input !py-1.5 !text-xs" />
                </div>
                <div className="col-span-4 md:col-span-1">
                  <label className="block text-[11px] text-subtext mb-1">الوحدة</label>
                  <input value={r.unit} onChange={e => update(i, { unit: e.target.value })} onPaste={e => handlePaste(e, i, 2)} className="eg-input !py-1.5 !text-xs" />
                </div>
                <div className="col-span-4 md:col-span-2">
                  <label className="block text-[11px] text-subtext mb-1">رقم الصنف</label>
                  <input value={r.part_no} onChange={e => update(i, { part_no: e.target.value })} onPaste={e => handlePaste(e, i, 3)} className="eg-input !py-1.5 !text-xs" />
                </div>
                <div className="col-span-10 md:col-span-2">
                  <label className="block text-[11px] text-subtext mb-1">ملاحظة</label>
                  <input value={r.remark} onChange={e => update(i, { remark: e.target.value })} onPaste={e => handlePaste(e, i, 4)} className="eg-input !py-1.5 !text-xs" />
                </div>
                <div className="col-span-2 md:col-span-1 flex justify-center">
                  <button onClick={() => setRows(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)}
                    className="text-subtext hover:text-danger p-1.5" title="إزالة السطر">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => setRows(prev => [...prev, { ...EMPTY }])} className="eg-btn-ghost !py-1.5 !text-xs">
                <Plus className="w-3.5 h-3.5" />سطر
              </button>
              <button onClick={save} disabled={saving || !rows.some(r => r.description.trim())} className="eg-btn-success !py-1.5 !text-xs disabled:opacity-40">
                <Save className="w-3.5 h-3.5" />{saving ? "جاري الحفظ..." : "حفظ Total BOM"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
