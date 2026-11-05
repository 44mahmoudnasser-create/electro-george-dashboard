// عهد مفتوحة: مين معاه إيه (بتتستخدم في صفحة العدة وفي الـ API)
export const HOLDERS_SELECT =
  "id, tech_id, tool_id, tool_item_id, open_qty, issued_at, technicians(name, department), tool_items(serial_no)";

export type Holder = {
  id: number;
  tech_id: number;
  tool_id: number;
  tool_item_id: number | null;
  open_qty: number;
  issued_at: string;
  tech_name: string;
  tech_dept: string | null;
  serial_no: string | null;
};

// Supabase بيرجع العلاقات أحياناً كمصفوفة وأحياناً كـ object
export function flattenHolders(rows: any[]): Holder[] {
  return (rows ?? []).map(r => {
    const t = Array.isArray(r.technicians) ? r.technicians[0] : r.technicians;
    const it = Array.isArray(r.tool_items) ? r.tool_items[0] : r.tool_items;
    return {
      id: r.id,
      tech_id: r.tech_id,
      tool_id: r.tool_id,
      tool_item_id: r.tool_item_id ?? null,
      open_qty: Number(r.open_qty),
      issued_at: r.issued_at,
      tech_name: t?.name ?? "—",
      tech_dept: t?.department ?? null,
      serial_no: it?.serial_no ?? null,
    };
  });
}
