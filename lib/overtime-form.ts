import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export type OvertimeFormRow = { name: string; route: string | null; dept: string | null };

const MIN_ROWS = 25; // الكشف الورقي فيه 25 سطر على الأقل

// yyyy-mm-dd → dd/mm/yyyy (من غير ما التوقيت يغيّر اليوم)
const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// اسم اليوم بالعربي من غير مشاكل timezone
const arabicWeekday = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ar-EG", { weekday: "long", timeZone: "UTC" });
};

export async function buildOvertimeForm(date: string, people: OvertimeFormRow[]): Promise<Blob> {
  const res = await fetch("/templates/overtime-form-template.docx");
  if (!res.ok) throw new Error("مش لاقي قالب الكشف");
  const buf = await res.arrayBuffer();

  // نملا الصفوف لحد 25 علشان الكشف يفضل شكله ورقي حتى لو العدد أقل
  const total = Math.max(MIN_ROWS, people.length);
  const rows = Array.from({ length: total }, (_, i) => {
    const p = people[i];
    return {
      no: i + 1,
      name: p?.name ?? "",
      route: p?.route ?? "",
      dept: p?.dept ?? "",
    };
  });

  const doc = new Docxtemplater(new PizZip(buf), { paragraphLoop: true, linebreaks: true });
  doc.render({ day: arabicWeekday(date), date: formatDate(date), rows });

  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
