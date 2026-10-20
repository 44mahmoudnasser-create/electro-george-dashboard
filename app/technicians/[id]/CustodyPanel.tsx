"use client";
import { Fragment, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { downloadCustodyReceipt } from "@/lib/custody-receipt";
import { Plus, Printer, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

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
const STATUS_STYLE: Record<string, string> = {
  "مستلمة": "bg-accent/15 text-accent",
  "مرتجعة": "bg-success/15 text-success",
  "مستهلكة": "bg-card2 text-subtext",
  "تالفة": "bg-warning/15 text-warning",
  "مفقودة": "bg-danger/15 text-danger",
};

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
  const canManage = role === "admin" || role === "manager";

  const [rows, setRows] = useState<CustodyRow[]>(custody);
  const [items, setItems] = useState<ItemLite[]>(availableItems);
  const [showClosed, setShowClosed] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [printing, setPrinting] = useState(false);

  const flash = (ok: boolean, text: string) => {
    setNotice({ ok, text });
    setTimeout(() => setNotice(null), 3500);
  };

  const open = useMemo(() => rows.filter(r => r.open_qty > 0), [rows]);
  const closed = useMemo(() => rows.filter(r => r.open_qty <= 0), [rows]);

  // أدوات بتتصرف للفني: عامة أو تابعة لقسمه
  const issuableTools = useMemo(
    () => tools.filter(t => !t.department || t.department === techDept),
    [tools, techDept]
  );

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

  const submitIssue = async () => {
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
    flash(true, `تم صرف ${data} ${isConsumable ? "" : "قطعة"} من ${issueTool.name}`);
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

  const submitEvent = async () => {
    if (!eventRow) return;
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

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

  return (
    <div className="space-y-4">
      {notice && (
        <div className={cn("text-xs px-3 py-2 rounded-lg border",
          notice.ok ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger")}>
          {notice.text}
        </div>
      )}

      {/* شريط الأدوات */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-xs">
          <span className="text-subtext">عهدة مفتوحة</span>
          <span className="font-bold text-text tabular-nums">{open.length}</span>
          <span className="text-subtext">عهدة مقفولة</span>
          <span className="font-bold text-text tabular-nums">{closed.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={printReceipt} disabled={printing || open.length === 0}
            className="eg-btn-ghost !py-1.5 !text-xs disabled:opacity-40" title="إيصال اختياري بالعهدة المفتوحة">
            <Printer className="w-3.5 h-3.5" />{printing ? "..." : "إيصال"}
          </button>
          {canManage && (
            <button onClick={openIssue} className="eg-btn-primary !py-1.5 !text-xs">
              <Plus className="w-3.5 h-3.5" />صرف عهدة
            </button>
          )}
        </div>
      </div>

      {/* العهدة المفتوحة */}
      <div className="eg-card !p-0 overflow-hidden">
        {open.length ? (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-card2 text-subtext">
                <th className="px-4 py-2 text-right font-semibold">الأداة</th>
                <th className="px-3 py-2 text-right font-semibold">الرقم التسلسلي</th>
                <th className="px-3 py-2 text-center font-semibold">المتبقي عند الفني</th>
                <th className="px-3 py-2 text-right font-semibold">تاريخ الصرف</th>
                <th className="px-3 py-2 text-right font-semibold">الحالة</th>
                {canManage && <th className="px-3 py-2 text-right font-semibold">إجراء</th>}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {open.map(r => (
                <Fragment key={r.id}>
                  <tr className="border-t border-border/40 hover:bg-card2/50">
                    <td className="px-4 py-2">
                      <div className="text-text font-medium">{r.tools?.name ?? "—"}</div>
                      <div className="text-[10px] text-subtext">{r.tools?.is_consumable ? "مستهلكة" : "قابلة لإعادة الاستخدام"}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-accent">{r.tool_items?.serial_no ?? "—"}</td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      <span className="font-bold text-text">{fmt(r.open_qty)}</span>
                      <span className="text-subtext"> / {fmt(r.qty)} {r.tools?.unit ?? ""}</span>
                    </td>
                    <td className="px-3 py-2 text-subtext tabular-nums">{r.issued_at}</td>
                    <td className="px-3 py-2"><span className={cn("px-2 py-0.5 rounded text-[11px]", STATUS_STYLE[r.status])}>{r.status}</span></td>
                    {canManage && (
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {eventKinds(r).map(k => (
                            <button key={k} onClick={() => openEvent(r, k)}
                              className="px-2 py-0.5 rounded border border-border text-[11px] text-subtext hover:text-text hover:border-accent/60">
                              {EVENT_LABEL[k]}
                            </button>
                          ))}
                        </div>
                      </td>
                    )}
                    <td className="px-2 py-2">
                      <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="text-subtext hover:text-text">
                        {expanded === r.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                  {expanded === r.id && <EventsRow events={r.custody_events} note={r.note} colSpan={canManage ? 7 : 6} />}
                </Fragment>
              ))}
            </tbody>
          </table>
        ) : <EmptyState message="مفيش عهدة مفتوحة عند الفني ده" />}
      </div>

      {/* العهد المقفولة */}
      {closed.length > 0 && (
        <div>
          <button onClick={() => setShowClosed(v => !v)} className="text-xs text-subtext hover:text-text flex items-center gap-1">
            {showClosed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            العهد المقفولة ({closed.length})
          </button>
          {showClosed && (
            <div className="eg-card !p-0 overflow-hidden mt-2">
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {closed.map(r => (
                    <Fragment key={r.id}>
                      <tr className="border-t border-border/40 first:border-t-0">
                        <td className="px-4 py-2 text-text">{r.tools?.name ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-subtext">{r.tool_items?.serial_no ?? "—"}</td>
                        <td className="px-3 py-2 text-subtext tabular-nums">{fmt(r.qty)} {r.tools?.unit ?? ""}</td>
                        <td className="px-3 py-2 text-subtext tabular-nums">{r.issued_at}</td>
                        <td className="px-3 py-2"><span className={cn("px-2 py-0.5 rounded text-[11px]", STATUS_STYLE[r.status])}>{r.status}</span></td>
                        <td className="px-2 py-2">
                          <button onClick={() => setExpanded(expanded === r.id ? null : r.id)} className="text-subtext hover:text-text">
                            {expanded === r.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      </tr>
                      {expanded === r.id && <EventsRow events={r.custody_events} note={r.note} colSpan={6} />}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ مودال صرف العهدة ═══ */}
      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title={`صرف عهدة — ${techName}`}>
        <div className="space-y-4">
          <div>
            <label className="eg-label">الأداة</label>
            <select value={issueToolId} onChange={e => { setIssueToolId(e.target.value); setIssueSerials([]); setIssueQty("1"); }}
              className="eg-select">
              <option value="">— اختار من الكتالوج —</option>
              {issuableTools.map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.is_consumable ? " (مستهلكة)" : ""}</option>
              ))}
            </select>
            {issuableTools.length === 0 && (
              <p className="text-[11px] text-subtext mt-1">مفيش أدوات متاحة للقسم ده — ضيفها من صفحة الأدوات الأول</p>
            )}
          </div>

          {issueTool && issueTool.is_consumable && (
            <div>
              <label className="eg-label">الكمية ({issueTool.unit})</label>
              <input type="number" min="0.01" step="any" value={issueQty}
                onChange={e => setIssueQty(e.target.value)} className="eg-input" />
            </div>
          )}

          {issueTool && !issueTool.is_consumable && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="eg-label !mb-0">الأرقام التسلسلية المتاحة</label>
                <span className="text-[11px] text-subtext tabular-nums">متحدد {issueSerials.length} من {issueAvailable.length}</span>
              </div>
              {issueAvailable.length ? (
                <div className="bg-card2 rounded-lg p-2 max-h-48 overflow-y-auto grid grid-cols-2 gap-1.5">
                  {issueAvailable.map(i => (
                    <label key={i.id} className="flex items-center gap-2 cursor-pointer text-xs text-text font-mono px-2 py-1 rounded hover:bg-card">
                      <input type="checkbox" checked={issueSerials.includes(i.id)} onChange={() => toggleSerial(i.id)}
                        className="accent-emerald-500 w-4 h-4" />
                      {i.serial_no}
                    </label>
                  ))}
                </div>
              ) : <p className="text-xs text-warning">مفيش قطع متاحة من الأداة دي في المخزن</p>}
            </div>
          )}

          <div>
            <label className="eg-label">ملاحظة (اختياري)</label>
            <input value={issueNote} onChange={e => setIssueNote(e.target.value)} className="eg-input" />
          </div>

          {issueError && <p className="text-xs text-danger">{issueError}</p>}
          <button onClick={submitIssue} disabled={issueBusy || !issueTool} className="eg-btn-success w-full justify-center">
            {issueBusy ? "جاري الصرف..." : "تأكيد الصرف"}
          </button>
        </div>
      </Modal>

      {/* ═══ مودال الحركة ═══ */}
      <Modal open={!!eventRow} onClose={() => setEventRow(null)} title={eventRow ? `${EVENT_LABEL[eventKind]} — ${eventRow.tools?.name ?? ""}` : ""} size="sm">
        {eventRow && (
          <div className="space-y-4">
            <div className="bg-card2 rounded-lg p-3 text-xs">
              <p className="text-text font-medium">{eventRow.tools?.name}{eventRow.tool_items ? ` · ${eventRow.tool_items.serial_no}` : ""}</p>
              <p className="text-subtext mt-1">المتبقي عند الفني: <span className="text-text font-bold tabular-nums">{fmt(eventRow.open_qty)}</span> {eventRow.tools?.unit ?? ""}</p>
            </div>
            {eventRow.tools?.is_consumable ? (
              <div>
                <label className="eg-label">الكمية</label>
                <input type="number" min="0.01" step="any" max={eventRow.open_qty} value={eventQty}
                  onChange={e => setEventQty(e.target.value)} className="eg-input" />
              </div>
            ) : (
              <p className="text-[11px] text-subtext">القطعة دي وحدة واحدة، والحركة بتقفل السطر.</p>
            )}
            <div>
              <label className="eg-label">ملاحظة (اختياري)</label>
              <input value={eventNote} onChange={e => setEventNote(e.target.value)} className="eg-input" />
            </div>
            {eventError && <p className="text-xs text-danger">{eventError}</p>}
            <button onClick={submitEvent} disabled={eventBusy} className="eg-btn-success w-full justify-center">
              {eventBusy ? "جاري التسجيل..." : "تأكيد"}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function EventsRow({ events, note, colSpan }: { events: CustodyEvent[]; note: string | null; colSpan: number }) {
  const sorted = [...events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <tr className="bg-card2/30 border-t border-border/30">
      <td colSpan={colSpan} className="px-4 py-3">
        {note && <p className="text-[11px] text-subtext mb-2">ملاحظة الصرف: {note}</p>}
        <p className="text-[11px] text-subtext mb-1.5">سجل الحركات</p>
        <div className="space-y-1">
          {sorted.map((e, i) => (
            <div key={i} className="flex items-center gap-3 text-[11px]">
              <span className="text-subtext tabular-nums w-36">{e.created_at.slice(0, 16).replace("T", " ")}</span>
              <span className="text-text w-20">{e.event}</span>
              <span className="tabular-nums w-12 text-subtext">{e.qty}</span>
              <span className="text-subtext">{e.note ?? ""}</span>
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}
