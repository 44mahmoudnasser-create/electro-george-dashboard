"use client";
import { useMemo, useState } from "react";
import { Download, ChevronDown, Plus, Pencil, Trash2, History, X, Code2, CalendarDays, SearchX } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { Page, PageHeader, PageBody } from "@/components/ui/Page";
import { StatPill } from "@/components/ui/StatCard";
import { SearchInput } from "@/components/ui/Filters";
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

// أنواع الإجراءات مش من حالات lib/status — بنلوّنها بكلاسات tone-* الجاهزة (شارة + دايرة الأيقونة)
const ACTION_STYLE = {
  INSERT: { label: "إضافة", verb: "أضاف", icon: Plus, cls: "tone-success" },
  UPDATE: { label: "تعديل", verb: "عدّل", icon: Pencil, cls: "tone-accent" },
  DELETE: { label: "حذف", verb: "حذف", icon: Trash2, cls: "tone-danger" },
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

  // للعرض بس: التاريخ بعد كلمة عربي بيتقلب (23-10-2026)، فبنعزله بعلامات اتجاه مخفية
  const recordLabelDisplay = (l: LogRow) => recordLabel(l).replace(/(\d{4}-\d{2}-\d{2})/g, "⁦$1⁩");

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
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `سجل_النشاط_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const resetFilters = () => {
    setSearch(""); setTableFilter("الكل"); setActionFilter("الكل");
    setDeptFilter("الكل"); setUserFilter("الكل"); setFrom(""); setTo("");
  };
  const filtersActive = !!(search || tableFilter !== "الكل" || actionFilter !== "الكل" ||
    deptFilter !== "الكل" || userFilter !== "الكل" || from || to);

  return (
    <Page width="5xl">
      <PageHeader
        title="سجل النشاط"
        icon={History}
        subtitle={<span className="tabular-nums">آخر {logs.length} حركة على النظام</span>}
        actions={
          <button type="button" onClick={exportCsv} disabled={filtered.length === 0} className="eg-btn-ghost eg-btn-sm">
            <Download className="size-3.5" />تصدير CSV
          </button>
        }
      >
        {/* الفلاتر */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="بحث بالاسم أو السجل" className="w-full sm:w-52" />
          <select value={userFilter} onChange={e => setUserFilter(e.target.value)} aria-label="المستخدم" className="eg-select eg-input-sm w-36">
            <option value="الكل">كل المستخدمين</option>
            {users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <select value={tableFilter} onChange={e => setTableFilter(e.target.value)} aria-label="نوع السجل" className="eg-select eg-input-sm w-36">
            <option value="الكل">كل الأنواع</option>
            {tables.map(t => <option key={t} value={t}>{entityName(t)}</option>)}
          </select>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} aria-label="الإجراء" className="eg-select eg-input-sm w-32">
            <option value="الكل">كل الإجراءات</option>
            <option value="INSERT">إضافة</option>
            <option value="UPDATE">تعديل</option>
            <option value="DELETE">حذف</option>
          </select>
          {depts.length > 0 && (
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} aria-label="القسم" className="eg-select eg-input-sm w-32">
              <option value="الكل">كل الأقسام</option>
              {depts.map(d => <option key={d} value={d}>{deptLabel(d)}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1.5">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="من" title="من" className="eg-input eg-input-sm w-36" />
            <span aria-hidden className="text-xs text-muted">—</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="إلى" title="إلى" className="eg-input eg-input-sm w-36" />
          </div>
          {filtersActive && (
            <button type="button" onClick={resetFilters} className="eg-btn-subtle eg-btn-xs">
              <X className="size-3" />مسح الفلاتر
            </button>
          )}
        </div>
      </PageHeader>

      <PageBody>
        {/* ملخص */}
        <div className="flex flex-wrap items-center gap-2">
          <StatPill label="النتائج" value={filtered.length} />
          <StatPill label={ACTION_STYLE.INSERT.label} value={counts.INSERT} tone="success" icon={Plus} />
          <StatPill label={ACTION_STYLE.UPDATE.label} value={counts.UPDATE} tone="accent" icon={Pencil} />
          <StatPill label={ACTION_STYLE.DELETE.label} value={counts.DELETE} tone="danger" icon={Trash2} />
        </div>

        {/* الخط الزمني */}
        {groups.length === 0 ? (
          <div className="eg-card">
            <EmptyState
              icon={logs.length ? SearchX : History}
              message={logs.length ? "مفيش حركات مطابقة للفلاتر" : "لسه مفيش حركات على النظام"}
              description={logs.length && filtersActive ? "غيّر الفلاتر أو امسح البحث علشان تشوف باقي الحركات." : undefined}
              action={filtersActive
                ? <button type="button" onClick={resetFilters} className="eg-btn-ghost eg-btn-sm">مسح الفلاتر</button>
                : undefined}
            />
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(([day, list]) => (
              <section key={day} className="space-y-2.5">
                <h2 className="flex items-center gap-2 px-1 text-sm font-semibold text-text">
                  <CalendarDays className="size-4 text-muted" />
                  {dayLabel(day)}
                  <span className="min-w-[1.25rem] rounded-full bg-card3 px-1.5 text-center text-[11px] font-semibold leading-[18px] text-subtext tabular-nums">
                    {list.length}
                  </span>
                </h2>
                <div className="eg-card divide-y divide-border/50 overflow-hidden !p-0">
                  {list.map(l => {
                    const st = ACTION_STYLE[l.action];
                    const Icon = st.icon;
                    const open = expanded === l.id;
                    const diffs = diffOf(l);
                    const time = new Date(l.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={l.id}>
                        <button type="button" onClick={() => { setExpanded(open ? null : l.id); setShowRaw(false); }}
                          aria-expanded={open} aria-controls={`log-${l.id}`}
                          className={cn("flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-card2/50", open && "bg-card2/40")}>
                          <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ring-1 ring-inset", st.cls)}>
                            <Icon className="size-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm leading-6 text-text">
                              <span className="font-semibold">{userName(l)}</span>
                              <span className="text-subtext"> {st.verb} {entityName(l.table_name)} </span>
                              <span className="font-medium">«{recordLabelDisplay(l)}»</span>
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className={cn("eg-badge", st.cls)}>{st.label}</span>
                              {l.department && (
                                <span className="eg-badge tone-neutral">{deptLabel(l.department)}</span>
                              )}
                              {l.action === "UPDATE" && diffs.length > 0 && (
                                <span className="text-[11px] text-subtext">
                                  <span className="tabular-nums">{diffs.length}</span> حقل اتغيّر
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 pt-1 text-subtext">
                            <span className="text-[11px] tabular-nums">{time}</span>
                            <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
                          </div>
                        </button>

                        {open && (
                          <div id={`log-${l.id}`} className="animate-fade-in space-y-3 bg-card2/40 px-4 pb-4 pt-1 sm:pr-14">
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-subtext">
                              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
                                {initials(l.user?.full_name, l.user?.email)}
                              </span>
                              <span className="font-medium text-text">{userName(l)}</span>
                              <span aria-hidden>·</span>
                              <span className="tabular-nums">{new Date(l.created_at).toLocaleString("ar-EG")}</span>
                            </div>

                            {l.action === "UPDATE" && diffs.length > 0 && (
                              <div className="overflow-x-auto rounded-lg border border-border/60 bg-card">
                                <table className="eg-table eg-table-compact">
                                  <thead>
                                    <tr>
                                      <th className="w-1/4">الحقل</th>
                                      <th>قبل</th>
                                      <th>بعد</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {diffs.map(d => (
                                      <tr key={d.key}>
                                        <td className="text-subtext">{FIELD[d.key] ?? d.key}</td>
                                        <td className="text-danger/90 line-through decoration-danger/60 [overflow-wrap:anywhere]">{fmtValue(d.from)}</td>
                                        <td className="font-medium text-success [overflow-wrap:anywhere]">{fmtValue(d.to)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {l.action === "INSERT" && l.new_data && (
                              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border border-border/60 bg-card p-3 md:grid-cols-3">
                                {Object.entries(l.new_data).filter(([k]) => !SKIP_FIELDS.has(k)).slice(0, 9).map(([k, v]) => (
                                  <div key={k} className="min-w-0">
                                    <dt className="text-[11px] leading-4 text-subtext">{FIELD[k] ?? k}</dt>
                                    <dd className="mt-0.5 truncate text-xs text-text" title={fmtValue(v)}>{fmtValue(v)}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}

                            {l.action === "DELETE" && l.old_data && (
                              <p className="text-xs leading-5 text-subtext">تم حذف السجل بالكامل. اضغط &quot;عرض البيانات الخام&quot; علشان تشوف محتواه.</p>
                            )}

                            <button type="button" onClick={() => setShowRaw(v => !v)} aria-expanded={showRaw}
                              className="eg-link inline-flex items-center gap-1 text-xs">
                              <Code2 className="size-3.5" />
                              {showRaw ? "إخفاء البيانات الخام" : "عرض البيانات الخام"}
                            </button>
                            {showRaw && (
                              <pre dir="ltr" className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/60 bg-bg/60 p-3 font-mono text-[11px] leading-5 text-subtext">
                                {JSON.stringify(l.action === "DELETE" ? l.old_data : l.new_data ?? l.old_data, null, 2)}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {filtered.length > limit && (
          <div className="flex justify-center">
            <button type="button" onClick={() => setLimit(l => l + 100)} className="eg-btn-ghost eg-btn-sm">
              <ChevronDown className="size-3.5" />
              عرض المزيد
              <span className="tabular-nums text-subtext">({filtered.length - limit} متبقي)</span>
            </button>
          </div>
        )}
      </PageBody>
    </Page>
  );
}
