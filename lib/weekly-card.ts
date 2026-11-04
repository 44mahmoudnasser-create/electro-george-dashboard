import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { deptLabel } from "@/lib/roles";

// كارت ساعات العمل الأسبوعية: ورقة لكل مجموعة، وكل سطر = يوم + بند
// ساعات البند = (عدد اللي اشتغلوا على البند) × 8 ساعات، مع خصم الإذن
// العمل الإضافي = 3 ساعات × عدد اللي عندهم عمل إضافي على البند

export type CardGroup = { id: number; name: string; department: string; supervisor_id: number | null };
export type CardTech = { id: number; name: string; department: string | null; grade: string };
export type CardAtt = { tech_id: number; date: string; status: string };
export type CardPerm = { tech_id: number; date: string; permission_type: string };
export type CardOt = { tech_id: number; date: string };
export type CardAsg = {
  tech_id: number; date: string;
  item: { item_no: number; work_order: { wo_number: string } | { wo_number: string }[] | null }
    | { item_no: number; work_order: { wo_number: string } | { wo_number: string }[] | null }[] | null;
  work_order_item_id?: number;
};

export type CardInput = {
  from: string; to: string;                 // yyyy-mm-dd
  groups: CardGroup[];
  groupMembers: { group_id: number; tech_id: number }[];
  technicians: CardTech[];
  attendance: CardAtt[];
  permissions: CardPerm[];
  overtime: CardOt[];
  assignments: CardAsg[];
};

const HOURS_PER_DAY = 8;
const OVERTIME_PER_PERSON = 3;
const fmtHours = (n: number) => String(Math.round(n * 100) / 100);

const fmtDM = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.toLocaleDateString("ar-EG", { weekday: "long", timeZone: "UTC" });
  return `${wd} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
};
const days = (from: string, to: string) => {
  const out: string[] = [];
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const cur = new Date(Date.UTC(y1, m1 - 1, d1));
  const end = new Date(Date.UTC(y2, m2 - 1, d2));
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
};
// خصم الإذن من الـ 8 ساعات
const permissionDeduction = (type: string | undefined) => {
  if (!type || type === "—") return 0;
  if (type.includes("نصف يوم")) return 4;
  if (type.includes("ساعتين")) return 2;
  return 0;
};
const labelOf = (a: CardAsg) => {
  const it = Array.isArray(a.item) ? a.item[0] : a.item;
  if (!it) return "بند";
  const wo = Array.isArray(it.work_order) ? it.work_order[0] : it.work_order;
  return `${wo?.wo_number ?? "—"} #${it.item_no}`;
};

// يحسب صفوف الكارت لكل مجموعة
export function computeWeeklyCard(input: CardInput) {
  const techById = new Map(input.technicians.map(t => [t.id, t] as const));
  const attOf = new Map(input.attendance.map(a => [`${a.tech_id}|${a.date}`, a.status] as const));
  const permOf = new Map(input.permissions.map(p => [`${p.tech_id}|${p.date}`, p.permission_type] as const));
  const otSet = new Set(input.overtime.map(o => `${o.tech_id}|${o.date}`));
  const allDays = days(input.from, input.to);

  const membersOf = (g: CardGroup) => {
    const ids = new Set<number>(input.groupMembers.filter(m => m.group_id === g.id).map(m => m.tech_id));
    if (g.supervisor_id) ids.add(g.supervisor_id);
    return Array.from(ids).filter(id => techById.has(id));
  };

  const groups = input.groups
    .map(g => ({ g, members: membersOf(g) }))
    .sort((a, b) => deptLabel(a.g.department).localeCompare(deptLabel(b.g.department), "ar") || a.g.name.localeCompare(b.g.name, "ar"))
    .map(({ g, members }) => {
      const memberSet = new Set(members);
      const rows: { day: string; woNo: string; hours: string; rework: string; overtime: string; notes: string }[] = [];
      const absentIds = new Set<number>();
      let absentDays = 0;

      allDays.forEach(day => {
        // أغياب الأسبوع للمجموعة
        members.forEach(id => {
          if (attOf.get(`${id}|${day}`) === "غياب") { absentIds.add(id); absentDays++; }
        });

        // كل فرد "حاضر" في اليوم ده: ساعاته = 8 - الإذن، وبتتقسم على البنود اللي اتعين عليها
        const dayAssign = input.assignments.filter(a => a.date === day && memberSet.has(a.tech_id));
        const itemsOfPerson = new Map<number, Set<string>>();
        const labelsByPerson = new Map<number, string[]>();
        dayAssign.forEach(a => {
          const lbl = labelOf(a);
          if (!itemsOfPerson.has(a.tech_id)) itemsOfPerson.set(a.tech_id, new Set());
          itemsOfPerson.get(a.tech_id)!.add(lbl);
        });
        itemsOfPerson.forEach((set, id) => labelsByPerson.set(id, Array.from(set).sort((x, y) => x.localeCompare(y, "ar"))));

        // المجاميع لكل بند
        const byItem = new Map<string, { hours: number; ot: number; people: string[]; notes: string[] }>();
        const ensure = (lbl: string) => {
          if (!byItem.has(lbl)) byItem.set(lbl, { hours: 0, ot: 0, people: [], notes: [] });
          return byItem.get(lbl)!;
        };
        labelsByPerson.forEach((labels, id) => {
          const name = techById.get(id)?.name ?? `#${id}`;
          const st = attOf.get(`${id}|${day}`);
          // بنحسب بس الحضور: غياب / أجازة / مأمورية / لم يُسجل مابيتحسبوش
          if (st !== "حاضر") {
            if (st === "غياب") absentIds.add(id);
            labels.forEach(lbl => ensure(lbl).notes.push(`${st === "غياب" ? "غياب" : "لم يُسجل"}: ${name}`));
            return;
          }
          const ded = permissionDeduction(permOf.get(`${id}|${day}`));
          const available = Math.max(0, HOURS_PER_DAY - ded);
          const share = available / labels.length;
          labels.forEach(lbl => {
            const item = ensure(lbl);
            item.hours += share;
            item.people.push(name);
            if (ded) item.notes.push(`إذن ${ded === 4 ? "نص يوم" : "ساعتين"}: ${name}`);
          });
          // العمل الإضافي بيتحسب مرة واحدة للفرد، على أول بند ليه
          if (otSet.has(`${id}|${day}`)) ensure(labels[0]).ot += 1;
        });

        const items = Array.from(byItem.entries()).sort((a, b) => a[0].localeCompare(b[0], "ar"));
        items.forEach(([lbl, it]) => {
          rows.push({
            day: dayLabel(day),
            woNo: lbl,
            hours: fmtHours(it.hours),
            rework: "",
            overtime: it.ot ? String(it.ot * OVERTIME_PER_PERSON) : "",
            notes: it.notes.join("، "),
          });
        });
      });

      // لو المجموعة مفيهاش أي تعيين في الفترة، الكارت بيوضح ده بدل ما يبان فاضي
      if (rows.length === 0) {
        rows.push({ day: "—", woNo: "لا توجد تعيينات في الفترة", hours: "0", rework: "", overtime: "", notes: "" });
      }

      const dept = deptLabel(g.department);
      const absentNames = Array.from(absentIds).map(id => techById.get(id)?.name ?? "").filter(Boolean);
      return {
        group: g.name,
        dept,
        weekFrom: fmtDM(input.from),
        weekTo: fmtDM(input.to),
        members: String(members.length),
        absentPeople: String(absentIds.size),
        absentHours: String(absentDays * HOURS_PER_DAY),
        notes: absentNames.length ? `الغائبين: ${absentNames.join("، ")}` : "",
        rows,
      };
    });

  return groups;
}

export async function buildWeeklyCard(input: CardInput): Promise<Blob> {
  const groups = computeWeeklyCard(input);
  const res = await fetch("/templates/weekly-hours-card-template.docx");
  if (!res.ok) throw new Error("مش لاقي قالب الكارت");
  const doc = new Docxtemplater(new PizZip(await res.arrayBuffer()), { paragraphLoop: true, linebreaks: true });
  doc.render({ groups });
  return doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
