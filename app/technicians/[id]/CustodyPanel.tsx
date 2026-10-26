"use client";
import { Fragment, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { downloadCustodyReceipt } from "@/lib/custody-receipt";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Badge from "@/components/ui/Badge";
import Field, { FormError } from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import Tooltip from "@/components/ui/Tooltip";
import { StatPill } from "@/components/ui/StatCard";
import { useToast } from "@/components/ui/Toast";
import { Plus, Printer, ChevronDown, Check, PackageOpen } from "lucide-react";

export type CustodyEvent = { event: string; qty: number; note: string | null; created_at: string };
export type CustodyRow = {
  id: number;
  tool_id: number;
  tool_item_id: number | null;
  qty: number;
  open_qty: number;
  status: string;
  issued_at: string;
  note: string | null;
  tools: { name: string; is_consumable: boolean; unit: string } | null;
  tool_items: { serial_no: string } | null;
  custody_events: CustodyEvent[];
};
export type ToolLite = { id: number; name: string; is_consumable: boolean; unit: string; department: string | null };
export type ItemLite = { id: number; tool_id: number; serial_no: string; status: string };

type EventKind = "استهلاك" | "ارتجاع" | "تلف" | "فقد";
const EVENT_LABEL: Record<EventKind, string> = {
  "استهلاك": "استهلاك",
  "ارتجاع": "ارتجاع للمخزن",
  "تلف": "تالف",
  "فقد": "مفقود",
};
// لون النقطة لكل حركة في سجل الحركات
const EVENT_DOT: Record<string, string> = {
  "صرف": "bg-accent",
  "استهلاك": "bg-subtext",
  "ارتجاع": "bg-success",
  "تلف": "bg-warning",
  "فقد": "bg-danger",
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

export default function CustodyPanel({
  techId, techName, techDept, role, custody, tools, availableItems,
}: {
  techId: number;
  techName: string;
  techDept: string | null;
  role: string;
  custody: CustodyRow[];
  tools: ToolLite[];
  availableItems: ItemLite[];
}) {
  const toast = useToast();
  const canManage = role === "admin" || role === "manager";

  const [rows, setRows] = useState<CustodyRow[]>(custody);
  const [items, setItems] = useState<ItemLite[]>(availableItems);
  const [showClosed, setShowClosed] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);

  const flash = (ok: boolean, text: string) => toast.show(ok, text);

  const open = useMemo(() => rows.filter(r => r.open_qty > 0), [rows]);
  const closed = useMemo(() => rows.filter(r => r.open_qty <= 0), [rows]);

  // أدوات بتتصرف للفني: عامة أو تابعة لقسمه
  const issuableTools = useMemo(
    () => tools.filter(t => !t.department || t.department === techDept),
    [tools, techDept]
  );

  const toggleExpanded = (id: number) => setExpanded(expanded === id ? null : id);

  /* ─────────── صرف عهدة ─────────── */
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueToolId, setIssueToolId] = useState("");
  const [issueQty, setIssueQty] = useState("1");
  const [issueSerials, setIssueSerials] = useState<number[]>([]);
  const [issueNote, setIssueNote] = useState("");
  const [issueBusy, setIssueBusy] = useState(false);
  const [issueError, setIssueError] = useState("");

  const issueTool = issuableTools.find(t => String(t.id) === issueToolId);
  const issueAvailable = useMemo(
    () => items.filter(i => String(i.tool_id) === issueToolId && i.status === "متاح"),
    [items, issueToolId]
  );

  const openIssue = () => {
    setIssueToolId(""); setIssueQty("1"); setIssueSerials([]); setIssueNote(""); setIssueError("");
    setIssueOpen(true);
  };

  const toggleSerial = (id: number) =>
    setIssueSerials(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const submitIssue = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (issueBusy) return;
    if (!issueTool) { setIssueError("اختار الأداة"); return; }
    setIssueBusy(true); setIssueError("");
    const isConsumable = issueTool.is_consumable;
    const { data, error } = await supabase.rpc("issue_custody", {
      p_tech_id: techId,
      p_tool_id: issueTool.id,
      p_qty: isConsumable ? parseFloat(issueQty) || 0 : 1,
      p_serial_ids: isConsumable ? null : issueSerials,
      p_note: issueNote.trim() || null,
    });
    setIssueBusy(false);
    if (error) { setIssueError(error.message); return; }

    // نجيب السطور الجديدة من الداتابيز بدل ما نحسبها بإيدنا
    const { data: fresh } = await supabase.from("custody")
      .select("id, tool_id, tool_item_id, qty, open_qty, status, issued_at, note, tools(name,is_consumable,unit), tool_items(serial_no), custody_events(event,qty,note,created_at)")
      .eq("tech_id", techId).order("id", { ascending: false });
    if (fresh) setRows(fresh as unknown as CustodyRow[]);

    if (!isConsumable) {
      setItems(prev => prev.map(i => issueSerials.includes(i.id) ? { ...i, status: "مع فني" } : i));
    }
    setIssueOpen(false);
    flash(true, `تم صرف ${data}${isConsumable ? "" : " قطعة"} من ${issueTool.name}`);
  };

  /* ─────────── حركة على عهدة ─────────── */
  const [eventRow, setEventRow] = useState<CustodyRow | null>(null);
  const [eventKind, setEventKind] = useState<EventKind>("ارتجاع");
  const [eventQty, setEventQty] = useState("1");
  const [eventNote, setEventNote] = useState("");
  const [eventBusy, setEventBusy] = useState(false);
  const [eventError, setEventError] = useState("");

  const openEvent = (row: CustodyRow, kind: EventKind) => {
    setEventRow(row); setEventKind(kind);
    setEventQty(row.tools?.is_consumable ? String(row.open_qty) : "1");
    setEventNote(""); setEventError("");
  };

  const eventKinds = (row: CustodyRow): EventKind[] =>
    row.tools?.is_consumable ? ["استهلاك", "ارتجاع", "تلف", "فقد"] : ["ارتجاع", "تلف", "فقد"];

  const submitEvent = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!eventRow || eventBusy) return;
    setEventBusy(true); setEventError("");
    const { data, error } = await supabase.rpc("custody_event", {
      p_custody_id: eventRow.id,
      p_event: eventKind,
      p_qty: parseFloat(eventQty) || 0,
      p_note: eventNote.trim() || null,
    });
    setEventBusy(false);
    if (error) { setEventError(error.message); return; }

    const res = data as { open_qty: number; status: string };
    const qty = parseFloat(eventQty) || 0;
    const serialId = eventRow.tool_item_id;
    const itemStatus = res.open_qty === 0 && serialId
      ? (eventKind === "ارتجاع" ? "متاح" : eventKind === "تلف" ? "تالف" : "مفقود")
      : null;

    setRows(prev => prev.map(r => r.id === eventRow.id ? {
      ...r,
      open_qty: res.open_qty,
      status: res.status,
      custody_events: [...r.custody_events, {
        event: eventKind, qty, note: eventNote.trim() || null, created_at: new Date().toISOString(),
      }],
    } : r));
    if (serialId && itemStatus) {
      setItems(prev => prev.map(i => i.id === serialId ? { ...i, status: itemStatus } : i));
    }
    setEventRow(null);
    flash(true, `تم تسجيل ${EVENT_LABEL[eventKind]}`);
  };

  /* ─────────── إيصال (اختياري) ─────────── */
  const printReceipt = async () => {
    if (open.length === 0) return;
    setPrinting(true);
    try {
      await downloadCustodyReceipt(techName, techDept, open.map(r => ({
        tool: r.tools?.name ?? "—",
        serial: r.tool_items?.serial_no ?? null,
        qty: r.open_qty,
        unit: r.tools?.unit ?? "عدد",
      })));
    } catch (e) {
      flash(false, (e as Error).message);
    }
    setPrinting(false);
  };

  return (
    <div className="space-y-4">
      {/* شريط الأدوات */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatPill label="عهدة مفتوحة" value={open.length} tone={open.length ? "accent" : "muted"} />
          <StatPill label="عهدة مقفولة" value={closed.length} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip content="إيصال اختياري بالعهدة المفتوحة">
            <button onClick={printReceipt} disabled={printing || open.length === 0} className="eg-btn-ghost eg-btn-sm">
              {printing ? <Spinner className="size-3.5" /> : <Printer className="size-3.5" />}
              إيصال
            </button>
          </Tooltip>
          {canManage && (
            <button onClick={openIssue} className="eg-btn-primary eg-btn-sm">
              <Plus className="size-3.5" />صرف عهدة
            </button>
          )}
        </div>
      </div>

      {/* العهدة المفتوحة */}
      <div className="eg-card overflow-hidden !p-0">
        {open.length ? (
          <div className="overflow-x-auto">
            <table className={cn("eg-table", canManage ? "min-w-[880px]" : "min-w-[660px]")}>
              <thead>
                <tr>
                  <th>الأداة</th>
                  <th>الرقم التسلسلي</th>
                  <th className="text-center">المتبقي عند الفني</th>
                  <th>تاريخ الصرف</th>
                  <th>الحالة</th>
                  {canManage && <th>إجراء</th>}
                  <th className="w-12"><span className="sr-only">سجل الحركات</span></th>
                </tr>
              </thead>
              <tbody>
                {open.map(r => {
                  const isOpen = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className={cn(isOpen && "bg-accent/[0.06]")}>
                        <td>
                          <div className="font-medium text-text">{r.tools?.name ?? "—"}</div>
                          <div className="text-[11px] text-subtext">{r.tools?.is_consumable ? "مستهلكة" : "قابلة لإعادة الاستخدام"}</div>
                        </td>
                        <td className="font-mono text-[12px] text-accent">
                          {r.tool_items?.serial_no ?? <span className="font-sans text-subtext">—</span>}
                        </td>
                        <td className="text-center tabular-nums">
                          <span className="font-semibold text-text">{fmt(r.open_qty)}</span>
                          <span className="text-subtext"> / {fmt(r.qty)} {r.tools?.unit ?? ""}</span>
                        </td>
                        <td className="tabular-nums text-subtext">{r.issued_at}</td>
                        <td><Badge label={r.status} /></td>
                        {canManage && (
                          <td>
                            <div className="flex flex-wrap gap-1.5">
                              {eventKinds(r).map(k => (
                                <button key={k} onClick={() => openEvent(r, k)} className="eg-btn-ghost eg-btn-xs">
                                  {EVENT_LABEL[k]}
                                </button>
                              ))}
                            </div>
                          </td>
                        )}
                        <td><ExpandButton open={isOpen} onClick={() => toggleExpanded(r.id)} /></td>
                      </tr>
                      {isOpen && <EventsRow events={r.custody_events} note={r.note} colSpan={canManage ? 7 : 6} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={PackageOpen} message="مفيش عهدة مفتوحة عند الفني ده" />}
      </div>

      {/* العهد المقفولة */}
      {closed.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowClosed(v => !v)} aria-expanded={showClosed}
            className="eg-btn-subtle eg-btn-sm">
            <ChevronDown className={cn("size-3.5 transition-transform duration-200", showClosed && "rotate-180")} />
            العهد المقفولة
            <span className="tabular-nums">({closed.length})</span>
          </button>
          {showClosed && (
            <div className="eg-card animate-fade-in overflow-hidden !p-0">
              <div className="overflow-x-auto">
                <table className="eg-table min-w-[620px]">
                  <thead>
                    <tr>
                      <th>الأداة</th>
                      <th>الرقم التسلسلي</th>
                      <th>الكمية</th>
                      <th>تاريخ الصرف</th>
                      <th>الحالة</th>
                      <th className="w-12"><span className="sr-only">سجل الحركات</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {closed.map(r => {
                      const isOpen = expanded === r.id;
                      return (
                        <Fragment key={r.id}>
                          <tr className={cn(isOpen && "bg-accent/[0.06]")}>
                            <td className="text-text">{r.tools?.name ?? "—"}</td>
                            <td className="font-mono text-[12px] text-subtext">{r.tool_items?.serial_no ?? "—"}</td>
                            <td className="tabular-nums text-subtext">{fmt(r.qty)} {r.tools?.unit ?? ""}</td>
                            <td className="tabular-nums text-subtext">{r.issued_at}</td>
                            <td><Badge label={r.status} /></td>
                            <td><ExpandButton open={isOpen} onClick={() => toggleExpanded(r.id)} /></td>
                          </tr>
                          {isOpen && <EventsRow events={r.custody_events} note={r.note} colSpan={6} />}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ مودال صرف العهدة ═══ */}
      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title={`صرف عهدة — ${techName}`}>
        <form onSubmit={submitIssue} noValidate className="space-y-4">
          <Field label="الأداة" required
            hint={issuableTools.length === 0 ? "مفيش أدوات متاحة للقسم ده — ضيفها من صفحة الأدوات الأول" : undefined}>
            <select value={issueToolId} onChange={e => { setIssueToolId(e.target.value); setIssueSerials([]); setIssueQty("1"); }}
              className="eg-select" autoFocus>
              <option value="">— اختار من الكتالوج —</option>
              {issuableTools.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.is_consumable ? " (مستهلكة)" : ""}</option>
              ))}
            </select>
          </Field>

          {issueTool && issueTool.is_consumable && (
            <Field label={`الكمية (${issueTool.unit})`} required>
              <input type="number" min="0.01" step="any" value={issueQty}
                onChange={e => setIssueQty(e.target.value)} className="eg-input" />
            </Field>
          )}

          {issueTool && !issueTool.is_consumable && (
            <Field label="الأرقام التسلسلية المتاحة" required
              hint={issueAvailable.length ? `متحدد ${issueSerials.length} من ${issueAvailable.length}` : undefined}>
              {issueAvailable.length ? (
                <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto overscroll-contain sm:grid-cols-3">
                  {issueAvailable.map(i => {
                    const on = issueSerials.includes(i.id);
                    return (
                      <label key={i.id} className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs text-text transition-colors duration-150",
                        on ? "border-accent/50 bg-accent/10" : "border-border/60 bg-card2/50 hover:border-border-strong",
                      )}>
                        <input type="checkbox" checked={on} onChange={() => toggleSerial(i.id)} className="shrink-0" />
                        <span className="min-w-0 truncate">{i.serial_no}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
                  مفيش قطع متاحة من الأداة دي في المخزن
                </p>
              )}
            </Field>
          )}

          <Field label="ملاحظة (اختياري)">
            <input value={issueNote} onChange={e => setIssueNote(e.target.value)} className="eg-input" />
          </Field>

          <FormError>{issueError}</FormError>
          <button type="submit" disabled={issueBusy || !issueTool} className="eg-btn-success w-full">
            {issueBusy ? <Spinner /> : <Check className="size-4" />}
            {issueBusy ? "جاري الصرف..." : "تأكيد الصرف"}
          </button>
        </form>
      </Modal>

      {/* ═══ مودال الحركة ═══ */}
      <Modal open={!!eventRow} onClose={() => setEventRow(null)} title={eventRow ? `${EVENT_LABEL[eventKind]} — ${eventRow.tools?.name ?? ""}` : ""} size="sm">
        {eventRow && (
          <form onSubmit={submitEvent} noValidate className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-card2/50 px-3 py-2.5 text-xs">
              <p className="font-medium text-text">
                {eventRow.tools?.name}
                {eventRow.tool_items && <span className="font-mono text-accent"> · {eventRow.tool_items.serial_no}</span>}
              </p>
              <p className="mt-1 text-subtext">
                المتبقي عند الفني: <span className="font-bold tabular-nums text-text">{fmt(eventRow.open_qty)}</span> {eventRow.tools?.unit ?? ""}
              </p>
            </div>
            {eventRow.tools?.is_consumable ? (
              <Field label="الكمية" required>
                <input type="number" min="0.01" step="any" max={eventRow.open_qty} value={eventQty}
                  onChange={e => setEventQty(e.target.value)} className="eg-input" autoFocus />
              </Field>
            ) : (
              <p className="text-[11px] text-subtext">القطعة دي وحدة واحدة، والحركة بتقفل السطر.</p>
            )}
            <Field label="ملاحظة (اختياري)">
              <input value={eventNote} onChange={e => setEventNote(e.target.value)} className="eg-input"
                autoFocus={!eventRow.tools?.is_consumable} />
            </Field>
            <FormError>{eventError}</FormError>
            <button type="submit" disabled={eventBusy} className="eg-btn-success w-full">
              {eventBusy ? <Spinner /> : <Check className="size-4" />}
              {eventBusy ? "جاري التسجيل..." : "تأكيد"}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}

/* ═══════════════════════ مكونات صغيرة ═══════════════════════ */

function ExpandButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  const label = open ? "إخفاء سجل الحركات" : "عرض سجل الحركات";
  return (
    <Tooltip content={label}>
      <button type="button" onClick={onClick} aria-label={label} aria-expanded={open} className="eg-icon-btn">
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
      </button>
    </Tooltip>
  );
}

function EventsRow({ events, note, colSpan }: { events: CustodyEvent[]; note: string | null; colSpan: number }) {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <tr>
      <td colSpan={colSpan} className="!bg-card2/40 px-4 py-3">
        <div className="animate-fade-in space-y-2.5">
          {note && (
            <p className="text-[11px] text-subtext">ملاحظة الصرف: <span className="text-text">{note}</span></p>
          )}
          <p className="text-[11px] font-semibold text-subtext">سجل الحركات</p>
          {sorted.length ? (
            <ol>
              {sorted.map((e, i) => (
                <li key={i} className="relative pb-2.5 pr-5 last:pb-0">
                  {i < sorted.length - 1 && (
                    <span aria-hidden className="absolute -bottom-1.5 right-[3.5px] top-3.5 w-px bg-border-strong" />
                  )}
                  <span aria-hidden className={cn("absolute right-0 top-1.5 size-2 rounded-full", EVENT_DOT[e.event] ?? "bg-accent")} />
                  <div className="flex flex-wrap items-baseline gap-x-3 text-xs leading-5">
                    <span className="font-medium text-text">{e.event}</span>
                    <span className="tabular-nums text-subtext">الكمية: {e.qty}</span>
                    <span className="tabular-nums text-subtext">{e.created_at.slice(0, 16).replace("T", " ")}</span>
                  </div>
                  {e.note && <p className="text-[11px] leading-5 text-subtext">{e.note}</p>}
                </li>
              ))}
            </ol>
          ) : <p className="text-[11px] text-subtext">مفيش حركات مسجلة</p>}
        </div>
      </td>
    </tr>
  );
}
