import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { downloadBlob } from "@/lib/overtime-form";

export type DispenseLine = {
  name: string;
  partNo: string;
  unit: string;
  requested: number;
  dispensed: number;
};

export type DispenseNoteInput = {
  noteNo: string;
  date: string;          // yyyy-mm-dd
  woNumber: string;
  process: string;
  engineer: string;
  receiver: string;
  lines: DispenseLine[];
};

const MIN_ROWS = 5;   // الإذن الورقي فيه 5 سطور على الأقل

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export async function buildDispenseNote(input: DispenseNoteInput): Promise<Blob> {
  const res = await fetch("/templates/dispense-note-template.docx");
  if (!res.ok) throw new Error("مش لاقي قالب إذن الصرف");
  const buf = await res.arrayBuffer();

  // المنصرف والمنصرف بالحروف بيتسيبوا فاضيين في الإذن المطبوع (بيتملوا بالإيد)
  const items = input.lines.map(l => ({
    name: l.name,
    part_no: l.partNo || "—",
    requested: `${l.requested} ${l.unit}`.trim(),
    dispensed: "",
    words: "",
  }));
  while (items.length < MIN_ROWS) {
    items.push({ name: "", part_no: "", requested: "", dispensed: "", words: "" });
  }

  const doc = new Docxtemplater(new PizZip(buf), { paragraphLoop: true, linebreaks: true });
  doc.render({
    date: formatDate(input.date),
    wo_number: input.woNumber,
    process: input.process || "—",
    note_no: input.noteNo,
    engineer: input.engineer || "—",
    receiver: input.receiver || "—",
    items,
  });

  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export async function downloadDispenseNote(input: DispenseNoteInput) {
  const blob = await buildDispenseNote(input);
  downloadBlob(blob, `إذن_صرف_${input.noteNo}.docx`);
}
