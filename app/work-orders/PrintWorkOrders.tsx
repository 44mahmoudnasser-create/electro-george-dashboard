// تقرير الطباعة: نفس شكل شيت الـ Expected invoice (أمر الشغل — العميل — المشروع — البنود — الكمية — التسليم — الملاحظات — الخطة)
// بيظهر على الشاشة مخفي، وبيتطبع بس لما الزرار "طباعة" يتدوس

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

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};
const fmtPlan = (ym: string | null) => {
  if (!ym) return "—";
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
};

export default function PrintWorkOrders({
  wos, items, title,
}: { wos: PrintWO[]; items: PrintItem[]; title: string }) {
  const printedAt = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="hidden print:block">
      <style>{`@media print {
        @page { size: A4 landscape; margin: 10mm; }
        body { background: #fff !important; }
      }`}</style>
      <div className="mb-3 flex items-end justify-between border-b border-black pb-2">
        <h1 className="text-lg font-bold text-black">{title}</h1>
        <span className="text-xs text-black">{printedAt} · {wos.length} أمر</span>
      </div>
      <table className="w-full border-collapse text-[10px] text-black" style={{ borderColor: "#000" }}>
        <thead>
          <tr className="bg-gray-100">
            {["Work Order #", "Client", "Project", "Order details / items", "Qty", "Contractual delivery date", "Notes", "Plan"].map(h => (
              <th key={h} className="border border-black px-1.5 py-1 text-left font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {wos.map(wo => {
            const its = items.filter(i => i.wo_id === wo.id).sort((a, b) => a.item_no - b.item_no);
            const span = Math.max(1, its.length);
            const rows = its.length ? its : [null];
            return rows.map((it, idx) => (
              <tr key={`${wo.id}-${it?.id ?? "none"}`} className="align-top" style={{ breakInside: "avoid" }}>
                {idx === 0 && (
                  <>
                    <td rowSpan={span} className="border border-black px-1.5 py-1 font-semibold">{wo.wo_number}</td>
                    <td rowSpan={span} className="border border-black px-1.5 py-1">{wo.client_name ?? "—"}</td>
                    <td rowSpan={span} className="border border-black px-1.5 py-1">{wo.project_name ?? "—"}</td>
                  </>
                )}
                <td className="border border-black px-1.5 py-1 whitespace-pre-line">{it?.description ?? "—"}</td>
                <td className="border border-black px-1.5 py-1 text-center tabular-nums">{it?.qty ?? "—"}</td>
                <td className="border border-black px-1.5 py-1 tabular-nums">{fmtDate(it?.expected_delivery ?? null)}</td>
                {idx === 0 && (
                  <td rowSpan={span} className="border border-black px-1.5 py-1 whitespace-pre-line">{wo.description ?? ""}</td>
                )}
                <td className="border border-black px-1.5 py-1">{fmtPlan(it?.plan_month ?? null)}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
