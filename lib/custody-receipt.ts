import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { downloadBlob } from "@/lib/overtime-form";

export type ReceiptRow = { tool: string; serial: string | null; qty: number; unit: string };

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// إيصال عهدة اختياري: بيتطبع للأدوات المفتوحة عند الفني، والتوقيع بيتم يدوي
export async function buildCustodyReceipt(name: string, dept: string | null, rows: ReceiptRow[]): Promise<Blob> {
  const res = await fetch("/templates/custody-receipt-template.docx");
  if (!res.ok) throw new Error("مش لاقي قالب الإيصال");
  const buf = await res.arrayBuffer();
  const today = new Date().toISOString().slice(0, 10);

  const doc = new Docxtemplater(new PizZip(buf), { paragraphLoop: true, linebreaks: true });
  doc.render({
    name,
    dept: dept ?? "—",
    date: formatDate(today),
    rows: rows.map((r, i) => ({ no: i + 1, tool: r.tool, serial: r.serial ?? "—", qty: r.qty, unit: r.unit })),
  });
  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export async function downloadCustodyReceipt(name: string, dept: string | null, rows: ReceiptRow[]) {
  const blob = await buildCustodyReceipt(name, dept, rows);
  downloadBlob(blob, `إيصال_عهدة_${name}.docx`);
}
