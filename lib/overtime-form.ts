import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { OVERTIME_TEMPLATE_B64 } from "./overtime-template";
import { deptLabel } from "./roles";

// اسم القسم بالعربي بدل الكود (ASSEMBLY → التجميع الميكانيكي، SHEET → الصاج)؛ عمود الكشف اسمه "القسم" فبنشيل كلمة "قسم"
const deptName = (dept: string) => deptLabel(dept).replace(/^قسم\s+/, "");

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
  // القالب متضمن جوه الكود، فمفيش fetch ولا ملفات static
  const buf = Uint8Array.from(atob(OVERTIME_TEMPLATE_B64), c => c.charCodeAt(0));

  // نملا الصفوف لحد 25 علشان الكشف يفضل شكله ورقي حتى لو العدد أقل
  const total = Math.max(MIN_ROWS, people.length);
  const rows = Array.from({ length: total }, (_, i) => {
    const p = people[i];
    return {
      no: i + 1,
      name: p?.name ?? "",
      route: p?.route ?? "",
      dept: p?.dept ? deptName(p.dept) : "",
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
