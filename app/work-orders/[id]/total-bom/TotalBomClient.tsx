"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Field from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import Tooltip from "@/components/ui/Tooltip";
import { Page, PageHeader, PageBody, SectionHeader } from "@/components/ui/Page";
import { useToast } from "@/components/ui/Toast";
import { Plus, Save, X, Lock, FileSpreadsheet, ListChecks, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = { description: string; qty: string; unit: string; part_no: string; remark: string };
type SavedRow = { id: number; s_no: number | null; qty: number; unit: string | null; description: string; part_no: string | null; remark: string | null };
const EMPTY: Row = { description: "", qty: "1", unit: "", part_no: "", remark: "" };
const COLS = ["description", "qty", "unit", "part_no", "remark"] as const;

// خانات محرر الكتابة بنفس ترتيب COLS (اللصق من Excel بيعتمد على الترتيب ده)
// span: عرض الخانة من 12 — على الموبايل وعلى الشاشات الكبيرة
const EDIT_COLS: { key: (typeof COLS)[number]; label: string; span: string; numeric?: boolean }[] = [
  { key: "description", label: "الوصف", span: "col-span-12 md:col-span-4" },
  { key: "qty", label: "الكمية", span: "col-span-4 md:col-span-2", numeric: true },
  { key: "unit", label: "الوحدة", span: "col-span-4 md:col-span-1" },
  { key: "part_no", label: "رقم الصنف", span: "col-span-4 md:col-span-2" },
  { key: "remark", label: "ملاحظة", span: "col-span-10 md:col-span-2" },
];

export default function TotalBomClient({
  wo, initialRows, canWrite,
}: {
  wo: { id: number; wo_number: string; client_name: string | null; project_name: string | null };
  initialRows: SavedRow[];
  canWrite: boolean;
}) {
  const toast = useToast();
  const [saved, setSaved] = useState<SavedRow[]>(initialRows);
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY }]);
  const [saving, setSaving] = useState(false);
  const locked = saved.length > 0;

  // إشعار سريع (toast) بدل الرسالة اللي كانت بتظهر جوه الصفحة
  const flash = (ok: boolean, text: string) => toast.show(ok, text);

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
    if (saving) return;
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
    if (payload.length === 0) { toast.warning("اكتب سطر واحد على الأقل"); return; }

    setSaving(true);
    const { data, error } = await supabase.rpc("set_total_bom", { p_wo_id: wo.id, p_rows: payload });
    if (error) { setSaving(false); flash(false, error.message); return; }

    // نجيب الصفوف المحفوظة من الداتابيز (الزرار بيفضل مقفول لحد ما نخلص علشان مايتبعتش مرتين)
    const { data: fresh } = await supabase.from("wo_total_bom").select("*").eq("wo_id", wo.id)
      .order("s_no", { ascending: true, nullsFirst: false });
    setSaving(false);
    setSaved((fresh ?? []) as SavedRow[]);
    setRows([{ ...EMPTY }]);
    flash(true, `تم حفظ Total BOM (${(data as { rows: number }).rows} سطر) — مقفول`);
  };

  return (
    <Page width="4xl">
      <PageHeader
        back={{ href: `/work-orders/${wo.id}`, label: "الأمر" }}
        icon={FileSpreadsheet}
        title="Total BOM"
        meta={locked && (
          <Badge label="مقفول" tone="neutral" dot={false}>
            <Lock className="size-3" />مقفول
          </Badge>
        )}
        subtitle={<>
          <span className="font-mono">{wo.wo_number}</span>
          {wo.client_name ? ` · ${wo.client_name}` : ""}{wo.project_name ? ` · ${wo.project_name}` : ""}
        </>}
      />

      <PageBody>
        {/* ── محفوظ ── */}
        {locked ? (
          <section className="eg-card overflow-hidden !p-0">
            <SectionHeader
              className="px-4 py-3 sm:px-5"
              title="البنود"
              icon={ListChecks}
              description={<span className="tabular-nums">{saved.length} سطر · مقفول</span>}
            />
            <div className="overflow-x-auto border-t border-border/60">
              <table className="eg-table eg-table-compact min-w-[520px]">
                <thead>
                  <tr>
                    <th className="w-12 text-center">#</th>
                    <th>الوصف</th>
                    <th className="w-24 text-center">الكمية</th>
                    <th className="w-24 text-center">الوحدة</th>
                    <th className="w-32">رقم الصنف</th>
                    <th>ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {saved.map((r, i) => (
                    <tr key={r.id}>
                      <td className="text-center tabular-nums text-subtext">{i + 1}</td>
                      <td className="text-text">{r.description}</td>
                      <td className="text-center tabular-nums">{r.qty}</td>
                      <td className="text-center text-subtext">{r.unit ?? "—"}</td>
                      <td className="font-mono text-subtext">{r.part_no ?? "—"}</td>
                      <td className="text-subtext">{r.remark ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <div className="eg-card">
            <EmptyState
              icon={FileSpreadsheet}
              compact={canWrite}
              message="لم يُكتب Total BOM لهذا الأمر بعد"
              description={canWrite ? "اكتبه من الجدول اللي تحت، أو الصق جدول كامل من Excel." : "بيكتبه مكتب التصميم أو المدير."}
            />
          </div>
        )}

        {/* ── كتابة (مرة واحدة) ── */}
        {!locked && canWrite && (
          <section className="eg-card space-y-4">
            <SectionHeader
              title="كتابة Total BOM"
              icon={PenLine}
              description="تقدر تلصق جدول كامل من Excel في أي خانة"
            />
            <p className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning/[0.06] px-3 py-2 text-xs leading-5 text-warning">
              <Lock className="mt-0.5 size-3.5 shrink-0" />
              بعد الحفظ هيتقفل نهائياً
            </p>

            <div className="space-y-2">
              {/* عناوين الأعمدة على الشاشات الكبيرة (على الموبايل كل خانة عليها عنوانها) */}
              <div aria-hidden className="hidden grid-cols-12 gap-2 md:grid">
                {EDIT_COLS.map(c => (
                  <span key={c.key} className={cn("text-xs font-medium text-subtext", c.span)}>{c.label}</span>
                ))}
              </div>
              {rows.map((r, i) => (
                <div key={i}
                  className="grid grid-cols-12 items-end gap-2 rounded-lg border border-border/60 bg-card2/30 p-2.5 md:items-center md:rounded-none md:border-0 md:bg-transparent md:p-0">
                  {EDIT_COLS.map(c => {
                    const id = `tbom-${i}-${c.key}`;
                    return (
                      <Field key={c.key} label={c.label} htmlFor={id} className={cn(c.span, "md:[&>label]:sr-only")}>
                        <input
                          id={id}
                          type={c.numeric ? "number" : undefined}
                          min={c.numeric ? "0.01" : undefined}
                          step={c.numeric ? "any" : undefined}
                          value={r[c.key]}
                          onChange={e => update(i, { [c.key]: e.target.value } as Partial<Row>)}
                          onPaste={e => handlePaste(e, i, COLS.indexOf(c.key))}
                          className="eg-input eg-input-sm"
                        />
                      </Field>
                    );
                  })}
                  <div className="col-span-2 flex justify-center md:col-span-1">
                    <Tooltip content="إزالة السطر">
                      <button type="button"
                        onClick={() => setRows(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)}
                        disabled={rows.length === 1}
                        className="eg-icon-btn-danger" aria-label={`إزالة السطر ${i + 1}`}>
                        <X className="size-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4">
              <button type="button" onClick={() => setRows(prev => [...prev, { ...EMPTY }])} className="eg-btn-ghost eg-btn-sm">
                <Plus className="size-3.5" />سطر
              </button>
              <button type="button" onClick={save} disabled={saving || !rows.some(r => r.description.trim())} className="eg-btn-success eg-btn-sm">
                {saving ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
                {saving ? "جاري الحفظ..." : "حفظ Total BOM"}
              </button>
            </div>
          </section>
        )}
      </PageBody>
    </Page>
  );
}
