"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Technician } from "@/types";
import { today } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import { Save, RefreshCw } from "lucide-react";

const ATT_OPTS = ["حاضر","غياب","أجازة","مأمورية"];
const PERM_OPTS = ["—","إذن ساعتين صباحي","إذن ساعتين مسائي","إذن نصف يوم صباحي","إذن نصف يوم مسائي"];

type AttRow = { tech_id:number; status:string; permission:string; overtime:boolean };

export default function AttendanceClient({
  initialTechnicians, role
}: { initialTechnicians: Technician[]; role: string }) {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<{name:string;date:string;status:string}[]>([]);

  const load = async () => {
    setLoading(true);
    const [att, perm, ot] = await Promise.all([
      supabase.from("attendance").select("tech_id,status").eq("date", date),
      supabase.from("permissions").select("tech_id,permission_type").eq("date", date),
      supabase.from("overtime").select("tech_id,has_overtime").eq("date", date),
    ]);
    const attMap = Object.fromEntries((att.data ?? []).map(r => [r.tech_id, r.status]));
    const permMap = Object.fromEntries((perm.data ?? []).map(r => [r.tech_id, r.permission_type]));
    const otMap = Object.fromEntries((ot.data ?? []).map(r => [r.tech_id, r.has_overtime]));
    setRows(initialTechnicians.map(t => ({
      tech_id: t.id,
      status: attMap[t.id] ?? "حاضر",
      permission: permMap[t.id] ?? "—",
      overtime: otMap[t.id] ?? false,
    })));
    // History
    const { data: hist } = await supabase
      .from("attendance")
      .select("tech_id, date, status, technicians(name)")
      .order("date", { ascending: false })
      .limit(50);
    setHistory((hist ?? []).map((r:any) => ({ name: r.technicians?.name, date: r.date, status: r.status })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [date]);

  const setRow = (tech_id:number, patch: Partial<AttRow>) => {
    setRows(prev => prev.map(r => r.tech_id === tech_id ? { ...r, ...patch } : r));
  };

  const save = async () => {
    setSaving(true);
    for (const r of rows) {
      await supabase.from("attendance")
        .upsert({ tech_id: r.tech_id, date, status: r.status }, { onConflict: "tech_id,date" });
      if (r.permission !== "—") {
        await supabase.from("permissions")
          .upsert({ tech_id: r.tech_id, date, permission_type: r.permission }, { onConflict: "tech_id,date" });
      } else {
        await supabase.from("permissions").delete().eq("tech_id", r.tech_id).eq("date", date);
      }
      await supabase.from("overtime")
        .upsert({ tech_id: r.tech_id, date, has_overtime: r.overtime }, { onConflict: "tech_id,date" });
    }
    setSaving(false);
    alert("✅ تم الحفظ بنجاح");
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-text">📅 الحضور والإذونات</h1>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="eg-input w-44" />
          <button onClick={load} className="eg-btn-ghost" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={save} disabled={saving} className="eg-btn-success">
            <Save className="w-4 h-4" />{saving ? "جاري الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="eg-card overflow-x-auto">
        <table className="eg-table">
          <thead><tr>
            <th>الاسم</th><th>الحضور</th><th>الإذن</th><th>عمل إضافي</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => {
              const tech = initialTechnicians.find(t => t.id === r.tech_id)!;
              return (
                <tr key={r.tech_id}>
                  <td className="font-medium text-text">{tech.name}</td>
                  <td>
                    <select value={r.status} onChange={e => setRow(r.tech_id, { status: e.target.value })}
                      className="eg-select w-36 text-sm">
                      {ATT_OPTS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={r.permission} onChange={e => setRow(r.tech_id, { permission: e.target.value })}
                      className="eg-select w-48 text-sm">
                      {PERM_OPTS.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </td>
                  <td className="text-center">
                    <input type="checkbox" checked={r.overtime}
                      onChange={e => setRow(r.tech_id, { overtime: e.target.checked })}
                      className="w-5 h-5 accent-emerald-500 cursor-pointer" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && !loading && (
          <p className="text-center py-10 text-subtext text-sm">لا يوجد فنيين — أضف الفنيين أولاً</p>
        )}
      </div>

      {/* History */}
      <div className="eg-card">
        <h2 className="font-semibold text-text mb-3">📊 آخر سجلات الحضور</h2>
        <div className="overflow-x-auto">
          <table className="eg-table">
            <thead><tr><th>الاسم</th><th>التاريخ</th><th>الحالة</th></tr></thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="text-text">{h.name}</td>
                  <td className="text-subtext">{h.date}</td>
                  <td><Badge label={h.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
