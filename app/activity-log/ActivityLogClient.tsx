"use client";
import { Fragment, useMemo, useState } from "react";
import { Search, Download, ChevronDown, ChevronUp, Plus, Pencil, Trash2, Activity } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { deptLabel, initials } from "@/lib/roles";

type LogRow = {
  id: number;
  table_name: string;
  record_id: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  department: string | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  created_at: string;
  user?: { full_name?: string | null; email?: string | null } | null;
};

/* ═══════════════ أسماء عربية ═══════════════ */

const ENTITY: Record<string, string> = {
  technicians: "الفني", work_orders: "أمر الشغل", purchases: "طلب شراء",
  purchase_orders: "أمر شراء", purchase_items: "صنف شراء", files: "ملف",
  attendance: "حضور", permissions: "إذن", overtime: "عمل إضافي",
  violations: "مخالفة", skills: "مهارة", tech_skills: "مهارة فني",
  daily_productivity: "إنتاجية", wo_bom_items: "بند BOM",
  wo_bom_dispense_log: "صرف BOM", wo_production_items: "بند إنتاج",
  wo_item_substages: "مرحلة تصنيع", wo_production_log: "تسجيل إنتاج",
  wo_substage_log: "تسجيل مرحلة", machines: "مكنة", paint_types: "نوع دهان",
  tools: "أداة", tool_items: "قطعة أداة", custody: "عهدة",
  custody_events: "حركة عهدة", app_users: "مستخدم", app_settings: "إعداد",
};

const FIELD: Record<string, string> = {
  name: "الاسم", full_name: "الاسم", email: "الإيميل", notify_email: "إيميل الإشعارات",
  role: "الصلاحية", grade: "الدرجة", route: "خط السير", department: "القسم",
  status: "الحالة", priority: "الأولوية", wo_number: "رقم الأمر", description: "الوصف",
  expected_delivery: "التسليم المتوقع", completion_date: "تاريخ الإتمام",
  created_date: "تاريخ الإنشاء", plan_month: "شهر الخطة",
  qty: "الكمية", quantity: "الكمية", qty_sheet: "الصاج", qty_paint: "الدهان",
  qty_assembly: "التجميع", qty_done: "المنجز", qty_dispensed: "المنصرف",
  open_qty: "المتبقي", item_name: "الصنف", date: "التاريخ", work_date: "تاريخ العمل",
  task: "المهمة", notes: "ملاحظات", note: "ملاحظة", reason: "السبب",
  details: "التفاصيل", permission_type: "نوع الإذن", has_overtime: "عمل إضافي",
  serial_no: "الرقم التسلسلي", is_consumable: "مستهلكة", unit: "الوحدة",
  active: "مفعّل", chk_client: "استلم العميل", chk_quality: "استلمته الجودة",
  chk_assembly: "التجميع الكهربي", tech_id: "الفني", wo_id: "أمر الشغل",
  tool_id: "الأداة", tool_item_id: "القطعة", file_name: "اسم الملف",
  file_type: "نوع الملف", delivery_date: "تاريخ التسليم", receive_date: "تاريخ الاستلام",
  paint_type_id: "نوع الدهان", required_painting: "يدخل دهان", sheet_steel: "الخامة",
  thickness: "السُمك", part_no: "Part No.", s_no: "S.NO", remark: "Remark",
  status_text: "الحالة",
};

const TECH_FK_TABLES = new Set(["attendance", "permissions", "overtime", "violations", "daily_productivity", "custody"]);
const SKIP_FIELDS = new Set(["id", "created_at", "updated_at", "created_by", "changed_by", "image_path"]);

const ACTION_STYLE = {
  INSERT: { label: "إضافة", verb: "أضاف", icon: Plus, cls: "bg-success/15 text-success", dot: "bg-success" },
  UPDATE: { label: "تعديل", verb: "عدّل", icon: Pencil, cls: "bg-accent/15 text-accent", dot: "bg-accent" },
  DELETE: { label: "حذف", verb: "حذف", icon: Trash2, cls: "bg-danger/15 text-danger", dot: "bg-danger" },
} as const;

const fmtValue = (v: any): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "نعم" : "لا";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/* ═══════════════ الكومبوننت ═══════════════ */

export default function ActivityLogClient({
  logs, techNames,
}: { logs: LogRow[]; techNames: Record<string, string> }) {
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("الكل");
  const [actionFilter, setActionFilter] = useState("الكل");
  const [deptFilter, setDeptFilter] = useState("الكل");
  const [userFilter, setUserFilter] = useState("الكل");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(100);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const userName = (l: LogRow) => l.user?.full_name || l.user?.email || "نظام";
  const entityName = (t: string) => ENTITY[t] ?? t;

  // اسم السجل: اسم الفني لو مرتبط بفني، وإلا أول حقل وصفي
  const recordLabel = (l: LogRow): string => {
    const d = l.new_data ?? l.old_data ?? {};
    if (TECH_FK_TABLES.has(l.table_name) && d.tech_id) {
      return techNames[String(d.tech_id)] ?? `فني #${d.tech_id}`;
    }
    return d.name ?? d.wo_number ?? d.serial_no ?? d.file_name ?? d.item_name ??
      d.skill_name ?? d.task ?? d.description ?? d.reason ?? d.permission_type ??
      (d.date ? `بتاريخ ${d.date}` : `#${l.record_id}`);
  };

  const tables = useMemo(() => Array.from(new Set(logs.map(l => l.table_name))).sort(), [logs]);
  const users = useMemo(() => Array.from(new Set(logs.map(userName))).sort(), [logs]);
  const depts = useMemo(() => Array.from(new Set(logs.map(l => l.department).filter(Boolean) as string[])).sort(), [logs]);

  const filtered = useMemo(() => logs.filter(l => {
    if (tableFilter !== "الكل" && l.table_name !== tableFilter) return false;
    if (actionFilter !== "الكل" && l.action !== actionFilter) return false;
    if (deptFilter !== "الكل" && l.department !== deptFilter) return false;
    if (userFilter !== "الكل" && userName(l) !== userFilter) return false;
    const day = l.created_at.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (search) {
      const hay = `${userName(l)} ${recordLabel(l)} ${entityName(l.table_name)}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [logs, tableFilter, actionFilter, deptFilter, userFilter, from, to, search, techNames]);

  const counts = useMemo(() => ({
    INSERT: filtered.filter(l => l.action === "INSERT").length,
    UPDATE: filtered.filter(l => l.action === "UPDATE").length,
    DELETE: filtered.filter(l => l.action === "DELETE").length,
  }), [filtered]);

  const visible = filtered.slice(0, limit);

  // تجميع حسب اليوم
  const groups = useMemo(() => {
    const map = new Map<string, LogRow[]>();
    visible.forEach(l => {
      const k = l.created_at.slice(0, 10);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(l);
    });
    return Array.from(map.entries());
  }, [visible]);

  const dayLabel = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("ar-EG", {
      weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    });
  };

  const diffOf = (l: LogRow) => {
    if (l.action !== "UPDATE" || !l.old_data || !l.new_data) return [];
    const keys = new Set([...Object.keys(l.old_data), ...Object.keys(l.new_data)]);
    return Array.from(keys)
      .filter(k => !SKIP_FIELDS.has(k) && JSON.stringify(l.old_data![k]) !== JSON.stringify(l.new_data![k]))
      .map(k => ({ key: k, from: l.old_data![k], to: l.new_data![k] }));
  };

  const exportCsv = () => {
    const rows = [["التاريخ", "الوقت", "المستخدم", "الإجراء", "نوع السجل", "السجل", "القسم"]];
    filtered.forEach(l => {
      const d = new Date(l.created_at);
      rows.push([
        d.toLocaleDateString("ar-EG"), d.toLocaleTimeString("ar-EG"),
        userName(l), ACTION_STYLE[l.action].label, entityName(l.table_name),
        recordLabel(l), l.department ?? "",
      ]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `سجل_النشاط_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const resetFilters = () => {
    setSearch(""); setTableFilter("الكل"); setActionFilter("الكل");
    setDeptFilter("الكل"); setUserFilter("الكل"); setFrom(""); setTo("");
  };
  const filtersActive = search || tableFilter !== "الكل" || actionFilter !== "الكل" ||
    deptFilter !== "الكل" || userFilter !== "الكل" || from || to;

  return (
    <div className="max-w-5xl mx-auto">
      {/* ═══ الهيدر الثابت ═══ */}
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-border/60 px-4 md:px-6 py-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-accent" />
            <div>
              <h1 className="text-lg font-bold text-text">سجل النشاط</h1>
              <p className="text-[11px] text-subtext">آخر {logs.length} حركة على النظام</p>
            </div>
          </div>
          <button onClick={exportCsv} disabled={filtered.length === 0}
            className="eg-btn-ghost !py-1.5 !text-xs disabled:opacity-40">
            <Download className="w-3.5 h-3.5" />تصدير CSV
          </button>
        </div>

        {/* الفلاتر */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtext" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              className="eg-input !py-1.5 !text-xs pr-8 w-44" placeholder="بحث بالاسم أو السجل" />
          </div>
          <select value={userFilter} onChange={e => setUserFilter(e.target.value)} className="eg-select !py-1.5 !text-xs w-36">
            <option value="الكل">كل المستخدمين</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={tableFilter} onChange={e => setTableFilter(e.target.value)} className="eg-select !py-1.5 !text-xs w-36">
            <option value="الكل">كل الأنواع</option>
            {tables.map(t => <option key={t} value={t}>{entityName(t)}</option>)}
          </select>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="eg-select !py-1.5 !text-xs w-28">
            <option value="الكل">كل الإجراءات</option>
            <option value="INSERT">إضافة</option>
            <option value="UPDATE">تعديل</option>
            <option value="DELETE">حذف</option>
          </select>
          {depts.length > 0 && (
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="eg-select !py-1.5 !text-xs w-32">
              <option value="الكل">كل الأقسام</option>
              {depts.map(d => <option key={d} value={d}>{deptLabel(d)}</option>)}
            </select>
          )}
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="eg-input !py-1.5 !text-xs w-36" title="من" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="eg-input !py-1.5 !text-xs w-36" title="إلى" />
          {filtersActive && (
            <button onClick={resetFilters} className="text-xs text-accent hover:underline px-2">مسح الفلاتر</button>
          )}
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        {/* ملخص */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="inline-flex items-center gap-1.5 bg-card2 rounded-md px-2.5 py-1 border border-border/50">
            <span className="text-subtext">النتائج</span><span className="font-bold text-text tabular-nums">{filtered.length}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 bg-card2 rounded-md px-2.5 py-1 border border-border/50">
            <Plus className="w-3 h-3 text-success" /><span className="font-bold text-success tabular-nums">{counts.INSERT}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 bg-card2 rounded-md px-2.5 py-1 border border-border/50">
            <Pencil className="w-3 h-3 text-accent" /><span className="font-bold text-accent tabular-nums">{counts.UPDATE}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 bg-card2 rounded-md px-2.5 py-1 border border-border/50">
            <Trash2 className="w-3 h-3 text-danger" /><span className="font-bold text-danger tabular-nums">{counts.DELETE}</span>
          </span>
        </div>

        {/* الخط الزمني */}
        {groups.length === 0 ? (
          <div className="eg-card"><EmptyState message="مفيش حركات مطابقة للفلاتر" /></div>
        ) : (
          <div className="space-y-5">
            {groups.map(([day, list]) => (
              <section key={day}>
                <h2 className="text-xs font-semibold text-subtext mb-2 sticky top-[7.5rem] bg-bg/90 py-1 z-[1]">
                  {dayLabel(day)} <span className="tabular-nums opacity-70">· {list.length}</span>
                </h2>
                <div className="eg-card !p-0 overflow-hidden divide-y divide-border/40">
                  {list.map(l => {
                    const st = ACTION_STYLE[l.action];
                    const Icon = st.icon;
                    const open = expanded === l.id;
                    const diffs = diffOf(l);
                    const time = new Date(l.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <Fragment key={l.id}>
                        <button onClick={() => { setExpanded(open ? null : l.id); setShowRaw(false); }}
                          className="w-full flex items-start gap-3 px-4 py-3 text-right hover:bg-card2/50 transition-colors">
                          <div className={cn("mt-0.5 w-7 h-7 shrink-0 rounded-full flex items-center justify-center", st.cls)}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-text leading-relaxed">
                              <span className="font-semibold">{userName(l)}</span>
                              <span className="text-subtext"> {st.verb} {entityName(l.table_name)} </span>
                              <span className="font-medium">«{recordLabel(l)}»</span>
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={cn("text-[10px] px-1.5 py-0.5 rounded", st.cls)}>{st.label}</span>
                              {l.department && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-card2 text-subtext">{deptLabel(l.department)}</span>
                              )}
                              {l.action === "UPDATE" && diffs.length > 0 && (
                                <span className="text-[10px] text-subtext">{diffs.length} حقل اتغيّر</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-subtext">
                            <span className="text-[11px] tabular-nums">{time}</span>
                            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </div>
                        </button>

                        {open && (
                          <div className="px-4 pb-4 pt-1 bg-card2/40 space-y-3">
                            <div className="flex items-center gap-2 text-[11px] text-subtext">
                              <span className="w-6 h-6 rounded-full bg-accent/20 text-accent flex items-center justify-center font-bold text-[10px]">
                                {initials(l.user?.full_name, l.user?.email)}
                              </span>
                              <span>{userName(l)}</span>
                              <span>·</span>
                              <span className="tabular-nums">{new Date(l.created_at).toLocaleString("ar-EG")}</span>
                            </div>

                            {l.action === "UPDATE" && diffs.length > 0 && (
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="text-subtext">
                                    <th className="py-1 text-right font-semibold w-1/4">الحقل</th>
                                    <th className="py-1 text-right font-semibold">قبل</th>
                                    <th className="py-1 text-right font-semibold">بعد</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {diffs.map(d => (
                                    <tr key={d.key} className="border-t border-border/30">
                                      <td className="py-1.5 text-subtext">{FIELD[d.key] ?? d.key}</td>
                                      <td className="py-1.5 text-danger/90 line-through">{fmtValue(d.from)}</td>
                                      <td className="py-1.5 text-success font-medium">{fmtValue(d.to)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}

                            {l.action === "INSERT" && l.new_data && (
                              <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                                {Object.entries(l.new_data).filter(([k]) => !SKIP_FIELDS.has(k)).slice(0, 9).map(([k, v]) => (
                                  <div key={k}>
                                    <dt className="text-[10px] text-subtext">{FIELD[k] ?? k}</dt>
                                    <dd className="text-text truncate">{fmtValue(v)}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}

                            {l.action === "DELETE" && l.old_data && (
                              <p className="text-xs text-subtext">تم حذف السجل بالكامل. اضغط "عرض البيانات الخام" لشوف محتواه.</p>
                            )}

                            <button onClick={() => setShowRaw(v => !v)} className="text-[11px] text-accent hover:underline">
                              {showRaw ? "إخفاء البيانات الخام" : "عرض البيانات الخام"}
                            </button>
                            {showRaw && (
                              <pre className="text-[10px] text-subtext bg-card rounded-md p-3 overflow-x-auto whitespace-pre-wrap" dir="ltr">
                                {JSON.stringify(l.action === "DELETE" ? l.old_data : l.new_data ?? l.old_data, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {filtered.length > limit && (
          <div className="flex justify-center">
            <button onClick={() => setLimit(l => l + 100)} className="eg-btn-ghost !py-1.5 !text-xs">
              عرض المزيد ({filtered.length - limit} متبقي)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
