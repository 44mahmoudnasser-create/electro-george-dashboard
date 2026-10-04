"use client";
import { useState, useMemo } from "react";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { Search } from "lucide-react";

type LogRow = {
  id: number;
  table_name: string;
  record_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  department: string | null;
  old_data: any;
  new_data: any;
  created_at: string;
  user?: { full_name?: string; email: string };
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  INSERT: { label: "إضافة", color: "text-success" },
  UPDATE: { label: "تعديل", color: "text-accent" },
  DELETE: { label: "حذف", color: "text-danger" },
};

// بيرجع أهم حقل وصفي من الصف (اسم/عنوان/رقم) عشان يبان في السجل
const pickLabel = (data: any): string => {
  if (!data) return "—";
  return data.name ?? data.wo_number ?? data.file_name ?? data.item_name ??
    data.skill_name ?? data.description ?? `#${data.id ?? ""}`;
};

export default function ActivityLogClient({
  logs, tableLabels,
}: { logs: LogRow[]; tableLabels: Record<string, string> }) {
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("الكل");
  const [actionFilter, setActionFilter] = useState("الكل");
  const [expanded, setExpanded] = useState<number | null>(null);

  const tables = useMemo(() => Array.from(new Set(logs.map(l => l.table_name))).sort(), [logs]);

  const filtered = useMemo(() => logs.filter(l => {
    if (tableFilter !== "الكل" && l.table_name !== tableFilter) return false;
    if (actionFilter !== "الكل" && l.action !== actionFilter) return false;
    if (search) {
      const hay = `${l.user?.full_name ?? ""} ${l.user?.email ?? ""} ${pickLabel(l.new_data ?? l.old_data)}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [logs, tableFilter, actionFilter, search]);

  // بيحسب الفروق بين القديم والجديد لعرضهم
  const getDiff = (oldData: any, newData: any) => {
    if (!oldData || !newData) return [];
    const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    const diffs: { key: string; from: any; to: any }[] = [];
    keys.forEach(k => {
      if (JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])) {
        diffs.push({ key: k, from: oldData[k], to: newData[k] });
      }
    });
    return diffs;
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-text">📜 سجل النشاط</h1>

      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-subtext" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="eg-input pr-9 w-56" placeholder="بحث بالاسم أو اليوزر" />
        </div>
        <select value={tableFilter} onChange={e => setTableFilter(e.target.value)} className="eg-select w-40">
          <option>الكل</option>
          {tables.map(t => <option key={t} value={t}>{tableLabels[t] ?? t}</option>)}
        </select>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="eg-select w-32">
          <option>الكل</option>
          <option value="INSERT">إضافة</option>
          <option value="UPDATE">تعديل</option>
          <option value="DELETE">حذف</option>
        </select>
      </div>

      <div className="eg-card divide-y divide-border/50">
        {filtered.map(l => {
          const info = ACTION_LABELS[l.action];
          const label = pickLabel(l.new_data ?? l.old_data);
          const diffs = l.action === "UPDATE" ? getDiff(l.old_data, l.new_data) : [];
          return (
            <div key={l.id} className="p-3">
              <button
                onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                className="w-full flex items-center justify-between gap-3 text-right">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold ${info.color}`}>{info.label}</span>
                  <span className="text-sm text-text font-medium">{label}</span>
                  <span className="text-xs text-subtext">في {tableLabels[l.table_name] ?? l.table_name}</span>
                  {l.department && <Badge label={l.department} />}
                </div>
                <div className="text-left shrink-0">
                  <p className="text-xs text-text">{l.user?.full_name || l.user?.email || "—"}</p>
                  <p className="text-xs text-subtext">{new Date(l.created_at).toLocaleString("ar-EG")}</p>
                </div>
              </button>
              {expanded === l.id && (
                <div className="mt-3 bg-card2 rounded-lg p-3 text-xs space-y-1">
                  {l.action === "UPDATE" && diffs.length > 0 ? (
                    diffs.map(d => (
                      <p key={d.key}>
                        <span className="text-subtext">{d.key}: </span>
                        <span className="text-danger line-through">{JSON.stringify(d.from)}</span>
                        {" ← "}
                        <span className="text-success">{JSON.stringify(d.to)}</span>
                      </p>
                    ))
                  ) : (
                    <pre className="whitespace-pre-wrap text-subtext">
                      {JSON.stringify(l.action === "DELETE" ? l.old_data : l.new_data, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <EmptyState message="لا يوجد نشاط" />}
      </div>
    </div>
  );
}
