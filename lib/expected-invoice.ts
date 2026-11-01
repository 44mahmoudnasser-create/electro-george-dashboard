import ExcelJS from "exceljs";

// يملأ نفس ملف الـ Excel الأصلي (public/templates/expected-invoice-template.xlsx)
// الستايل والخطوط والألوان والدمج بيتحفظ من الـ template، والبيانات بتتكتب تحت الهيدر

export type InvoiceWO = {
  id: number;
  wo_number: string;
  client_name: string | null;
  project_name: string | null;
  description: string | null;
};
export type InvoiceItem = {
  id: number;
  wo_id: number;
  item_no: number;
  description: string | null;
  qty: number | null;
  expected_delivery: string | null;
  plan_month: string | null;
};

const DATA_START = 3;          // أول صف بيانات (الصفوف 1 و2 = العنوان والهيدر)
const COLS = 8;                // A..H

const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return { y, label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }) };
};

function titleFor(month: string) {
  const { y, label } = monthName(month);
  return `Expected invoice for ${label} ${y}`;
}

// ارتفاع الصف بيتحسب من طول النص وعرض العمود (Arial 10 تقريباً 1.15 حرف لكل وحدة عرض)
const LINE_PT = 13;
const linesFor = (value: any, colWidth: number) => {
  if (value === null || value === undefined || value === "") return 1;
  const text = value instanceof Date ? "00/00/00" : String(value);
  const perLine = Math.max(4, Math.floor(colWidth * 1.15));
  return text.split("\n").reduce((n, part) => n + Math.max(1, Math.ceil(part.length / perLine)), 0);
};

const fmtDate = (iso: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d));   // تاريخ حقيقي عشان Excel يعرضه بنفس صيغة الـ template
};
const fmtPlan = (ym: string | null) => (ym ? monthName(ym).label : null);

export async function buildExpectedInvoice(allWos: InvoiceWO[], allItems: InvoiceItem[], month: string): Promise<ArrayBuffer> {
  // بنعرض بس البنود اللي خطتها في الشهر المختار، والأوامر اللي ليها بنود بالشهر ده
  const items = allItems.filter(i => i.plan_month === month);
  const wosWithItems = new Set(items.map(i => i.wo_id));
  const wos = allWos.filter(w => wosWithItems.has(w.id));

  const res = await fetch("/templates/expected-invoice-template.xlsx");
  if (!res.ok) throw new Error("مش لاقي قالب الـ Excel");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());
  const ws = wb.worksheets[0];

  // العنوان
  ws.getCell(1, 1).value = titleFor(month);

  // شيل الدمج القديم من منطقة البيانات (العنوان فوق بيفضل زي ما هو)
  const oldMerges = Object.values((ws as any)._merges ?? {}).map((m: any) => m.model);
  oldMerges.forEach((m: any) => {
    if (m.top >= DATA_START) ws.unMergeCells(m.top, m.left, m.bottom, m.right);
  });
  // امسح القيم والدمج في منطقة البيانات
  const lastRow = Math.max(ws.rowCount, DATA_START);
  for (let r = DATA_START; r <= lastRow; r++) {
    for (let c = 1; c <= COLS; c++) ws.getCell(r, c).value = null;
  }

  // ستايل صف البيانات من الـ template (أول صف بيانات) عشان أي خلية جديدة تاخده
  const styleOf = (col: number) => ({ ...ws.getCell(DATA_START, col).style });

  let row = DATA_START;
  const write = (r: number, c: number, value: any, center = true) => {
    const cell = ws.getCell(r, c);
    cell.value = value;
    cell.style = styleOf(c) as any;
    cell.alignment = { horizontal: center ? "center" : "left", vertical: "middle", wrapText: true };
  };

  wos.forEach(wo => {
    const its = items.filter(i => i.wo_id === wo.id).sort((a, b) => a.item_no - b.item_no);
    const span = Math.max(1, its.length);
    const first = its[0];
    const start = row;

    for (let k = 0; k < span; k++) {
      const it = its[k];
      const r = start + k;
      if (k === 0) {
        write(r, 1, wo.wo_number);
        write(r, 2, wo.client_name ?? null);
        write(r, 3, wo.project_name ?? null);
      } else {
        // خلايا الدمج لازم تبقى موجودة بالستايل
        [1, 2, 3].forEach(c => write(r, c, null));
      }
      write(r, 4, it?.description ?? null, false);
      write(r, 5, it?.qty ?? null);
      if (k === 0) {
        write(r, 6, fmtDate(first?.expected_delivery ?? null));
        if (first?.expected_delivery) ws.getCell(r, 6).numFmt = "dd/mm/yy";   // نفس صيغة التاريخ في الـ template
        write(r, 7, wo.description ?? null, false);
        write(r, 8, fmtPlan(first?.plan_month ?? null));
      } else {
        [6, 7, 8].forEach(c => write(r, c, null));
      }
    }

    // ارتفاع الصفوف: كل صف على قد أطول نص فيه، والخلايا المدموجة بتتوزع على صفوف الأمر
    const widthOf = (c: number) => Number(ws.getColumn(c).width) || 10;
    const need: number[] = Array.from({ length: span }, () => 1);
    for (let k = 0; k < span; k++) {
      const it = its[k];
      need[k] = Math.max(need[k], linesFor(it?.description ?? null, widthOf(4)), linesFor(it?.qty ?? null, widthOf(5)));
    }
    if (span > 0) {
      const mergedNeed = Math.max(
        linesFor(wo.wo_number, widthOf(1)), linesFor(wo.client_name, widthOf(2)), linesFor(wo.project_name, widthOf(3)),
        linesFor(wo.description, widthOf(7)), linesFor(first?.expected_delivery ? "00/00/00" : null, widthOf(6)),
        linesFor(fmtPlan(first?.plan_month ?? null), widthOf(8)),
      );
      const perRow = Math.ceil(mergedNeed / span);
      for (let k = 0; k < span; k++) need[k] = Math.max(need[k], perRow);
    }
    need.forEach((lines, k) => {
      ws.getRow(start + k).height = Math.max(16.05, lines * LINE_PT + 3);
    });

    // دمج الخلايا اللي بتتكرر للأمر الواحد (زي الـ template)
    if (span > 1) {
      const end = start + span - 1;
      [1, 2, 3, 6, 7, 8].forEach(c => ws.mergeCells(start, c, end, c));
    }
    row += span;
  });

  // حدود للصفوف اللي اتكتبت (لو الـ template ما فيهاش)
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

export async function downloadExpectedInvoice(wos: InvoiceWO[], items: InvoiceItem[], month: string) {
  const buf = await buildExpectedInvoice(wos, items, month);
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Expected_invoice_${month}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
