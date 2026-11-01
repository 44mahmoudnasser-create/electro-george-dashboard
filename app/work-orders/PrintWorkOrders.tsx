// تقرير الطباعة: نسخة مطابقة لشيت "Expected invoice" (نفس الخطوط والألوان والعروض والخلايا المدموجة)
// بيظهر مخفي على الشاشة، وبيتطبع بس لما الزرار "طباعة" يتدوس

type PrintWO = {
  id: number;
  wo_number: string;
  client_name: string | null;
  project_name: string | null;
  description: string | null;
};
type PrintItem = {
  id: number;
  wo_id: number;
  item_no: number;
  description: string | null;
  qty: number | null;
  expected_delivery: string | null;
  plan_month: string | null;
};

// ألوان وخط الشيت الأصلي
const TEXT = "#1F4E79";
const TITLE_FILL = "#FCE4D6";
const HEADER_FILL = "#D9E1F2";
const BORDER = "1px solid #000";
// عروض الأعمدة من الشيت (A..H) كنسب من الإجمالي
const COL_WIDTHS = ["5.05%", "14.16%", "16.18%", "27.8%", "3.54%", "8.09%", "20.23%", "4.95%"];

const CELL: React.CSSProperties = {
  border: BORDER,
  color: TEXT,
  fontFamily: "Arial, sans-serif",
  fontSize: "10px",
  textAlign: "center",
  verticalAlign: "middle",
  padding: "2px 4px",
  whiteSpace: "pre-line",
  wordBreak: "break-word",
};

const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;   // نفس صيغة الشيت (الشهر/اليوم/السنة)
};
const fmtPlan = (ym: string | null) => {
  if (!ym) return "";
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
};

// عنوان الشيت: "Expected invoice for <الشهر> <السنة>" حسب أكتر شهر خطة في الأوامر المعروضة
function titleFor(wos: PrintWO[], items: PrintItem[]) {
  const ids = new Set(wos.map(w => w.id));
  const counts = new Map<string, number>();
  items.filter(i => ids.has(i.wo_id) && i.plan_month).forEach(i => {
    counts.set(i.plan_month!, (counts.get(i.plan_month!) ?? 0) + 1);
  });
  let key = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!key) {
    const now = new Date();
    key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  const [y, m] = key.split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `Expected invoice for ${month} ${y}`;
}

export default function PrintWorkOrders({ wos, items }: { wos: PrintWO[]; items: PrintItem[] }) {
  const headers = ["Work Order #", "Client", "Project", "Order details / items", "Qty", "Contractual delivery date", "Notes", "Plan"];

  return (
    <div className="hidden print:block">
      <style>{`@media print {
        @page { size: A4 landscape; margin: 8mm; }
        body { background: #fff !important; }
        table { page-break-inside: auto; }
        tr { page-break-inside: avoid; }
        thead { display: table-header-group; }
      }`}</style>
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
        <colgroup>
          {COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
        </colgroup>
        <thead>
          <tr>
            <th colSpan={8} style={{ ...CELL, background: TITLE_FILL, fontSize: "13px", fontWeight: "bold", height: "26px" }}>
              {titleFor(wos, items)}
            </th>
          </tr>
          <tr>
            {headers.map(h => (
              <th key={h} style={{ ...CELL, background: HEADER_FILL, fontWeight: "bold" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {wos.map(wo => {
            const its = items.filter(i => i.wo_id === wo.id).sort((a, b) => a.item_no - b.item_no);
            const span = Math.max(1, its.length);
            const rows: (PrintItem | null)[] = its.length ? its : [null];
            return rows.map((it, idx) => (
              <tr key={`${wo.id}-${it?.id ?? "none"}`}>
                {idx === 0 && (
                  <>
                    <td rowSpan={span} style={{ ...CELL, fontWeight: "normal" }}>{wo.wo_number}</td>
                    <td rowSpan={span} style={CELL}>{wo.client_name ?? ""}</td>
                    <td rowSpan={span} style={CELL}>{wo.project_name ?? ""}</td>
                  </>
                )}
                <td style={{ ...CELL, textAlign: "center" }}>{it?.description ?? ""}</td>
                <td style={CELL}>{it?.qty ?? ""}</td>
                {idx === 0 && (
                  <td rowSpan={span} style={CELL}>{fmtDate(its[0]?.expected_delivery ?? null)}</td>
                )}
                {idx === 0 && (
                  <td rowSpan={span} style={CELL}>{wo.description ?? ""}</td>
                )}
                {idx === 0 && (
                  <td rowSpan={span} style={CELL}>{fmtPlan(its[0]?.plan_month ?? null)}</td>
                )}
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
