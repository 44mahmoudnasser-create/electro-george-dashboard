"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import Field from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import { Page, PageHeader, PageBody } from "@/components/ui/Page";
import { SearchInput } from "@/components/ui/Filters";
import { useToast } from "@/components/ui/Toast";
import { Download, Send, FolderOpen, FileText, Clock, ArrowLeft } from "lucide-react";
import { today } from "@/lib/utils";

type FileRow = {
  id: number; wo_id?: number; work_order_item_id?: number | null; file_name: string; file_type?: string;
  receive_date?: string; delivered_to?: number; delivery_date?: string;
  work_order?: { wo_number: string };
  file_items?: { item: { item_no: number; description: string } | null }[];
  supervisor?: { name: string };
};
type ItemLite = { id: number; wo_id: number; item_no: number; description: string };

const itemLabel = (it?: { item_no: number; description: string } | null) =>
  it ? `#${it.item_no} ${it.description}` : "";
// كل البنود اللي الملف يخصها، مترتبة برقم البند
const fileItems = (f: FileRow) =>
  (f.file_items ?? []).map(x => x.item).filter(Boolean)
    .sort((a, b) => a!.item_no - b!.item_no) as { item_no: number; description: string }[];
const fileItemsLabel = (f: FileRow) => fileItems(f).map(itemLabel).join("، ");

const FILE_TYPES = ["إضافة","تعديل","أمر الشغل نفسه"];

export default function FilesClient({
  initialFiles, wos, items, supervisors, role,
}: {
  initialFiles: FileRow[];
  wos: { id: number; wo_number: string }[];
  items: ItemLite[];
  supervisors: { id: number; name: string }[];
  role: string;
}) {
  const toast = useToast();
  const [files, setFiles] = useState<FileRow[]>(initialFiles);
  const [search, setSearch] = useState("");
  const [recvOpen, setRecvOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const emptyRecv = () => ({ wo_id: "", item_ids: [] as string[], file_name: "", file_type: FILE_TYPES[0], receive_date: today() });
  const [recvForm, setRecvForm] = useState(emptyRecv);
  const [deliverForm, setDeliverForm] = useState({ file_id: "", supervisor_id: "", delivery_date: today() });

  const pending = files.filter(f => !f.delivered_to);
  const filtered = files.filter(f =>
    !search || f.file_name.toLowerCase().includes(search.toLowerCase()) ||
    (f.work_order?.wo_number ?? "").includes(search) ||
    fileItemsLabel(f).includes(search)
  );

  // بنود الأمر المختار في فورم الاستلام — الملف بيتسجل على بند
  const recvItems = items.filter(it => String(it.wo_id) === recvForm.wo_id);
  const recvNeedsItem = recvForm.wo_id !== "";
  const recvValid = !!recvForm.file_name.trim() && (!recvNeedsItem || recvForm.item_ids.length > 0);
  const toggleRecvItem = (id: string) => setRecvForm(f => ({
    ...f, item_ids: f.item_ids.includes(id) ? f.item_ids.filter(x => x !== id) : [...f.item_ids, id],
  }));
  const allRecvItems = recvItems.length > 0 && recvItems.every(it => recvForm.item_ids.includes(String(it.id)));

  const openDeliver = (fileId?: number) => {
    setDeliverForm({ file_id: fileId ? String(fileId) : "", supervisor_id: "", delivery_date: today() });
    setDeliverOpen(true);
  };

  // بيبعت إيميل + إشعار عن الملف (التفاصيل بتتقرا من الداتابيز في السيرفر)
  const notify = (fileId: number, event: "received" | "delivered") => {
    fetch("/api/files/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId, event }),
    }).catch(() => {}); // لو الإشعار فشل، متوقفش العملية
  };

  const recvFile = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!recvValid || saving) return;
    setSaving(true);
    const { data, error } = await supabase.from("files").insert({
      wo_id: recvForm.wo_id ? parseInt(recvForm.wo_id) : null,
      file_name: recvForm.file_name,
      file_type: recvForm.file_type,
      receive_date: recvForm.receive_date || today(),
    }).select("id").single();
    if (error) { setSaving(false); toast.error(error.message); return; }

    // ربط الملف بالبنود المختارة؛ لو فشل بنمسح الملف علشان مايفضلش متسجل من غير بنوده
    if (recvForm.item_ids.length) {
      const { error: linkErr } = await supabase.from("file_items")
        .insert(recvForm.item_ids.map(id => ({ file_id: data.id, item_id: parseInt(id) })));
      if (linkErr) {
        await supabase.from("files").delete().eq("id", data.id);
        setSaving(false); toast.error(linkErr.message); return;
      }
    }
    const { data: fresh } = await supabase.from("files")
      .select(`*, work_order:work_orders(wo_number), file_items(item:work_order_items(item_no, description)), supervisor:technicians(name)`)
      .eq("id", data.id).single();
    setSaving(false);
    notify(data.id, "received");
    if (fresh) setFiles(prev => [fresh, ...prev]);
    setRecvOpen(false);
    setRecvForm(emptyRecv());
    toast.success("تم تسجيل استلام الملف");
  };

  const deliverFile = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!deliverForm.file_id || !deliverForm.supervisor_id || saving) return;
    setSaving(true);
    const fileId = parseInt(deliverForm.file_id);
    const supId  = parseInt(deliverForm.supervisor_id);
    const { error } = await supabase.from("files").update({
      delivered_to: supId,
      delivery_date: deliverForm.delivery_date || today(),
    }).eq("id", fileId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    notify(fileId, "delivered");
    const sup = supervisors.find(s => s.id === supId);
    setFiles(prev => prev.map(f => f.id === fileId
      ? { ...f, delivered_to: supId, delivery_date: deliverForm.delivery_date, supervisor: sup ? { name: sup.name } : undefined }
      : f
    ));
    setDeliverOpen(false);
    setDeliverForm({ file_id: "", supervisor_id: "", delivery_date: today() });
    toast.success("تم تسجيل التسليم");
  };

  return (
    <Page width="5xl">
      <PageHeader
        title="الملفات"
        icon={FolderOpen}
        subtitle={<span className="tabular-nums">{filtered.length === files.length ? `${files.length} ملف` : `${filtered.length} من ${files.length} ملف`}</span>}
        actions={<>
          <SearchInput value={search} onChange={setSearch} placeholder="بحث باسم الملف أو الأمر" className="w-full sm:w-56" />
          <button onClick={() => setRecvOpen(true)} className="eg-btn-primary eg-btn-sm">
            <Download className="size-3.5" />استلام ملف
          </button>
          <button onClick={() => openDeliver()} className="eg-btn-ghost eg-btn-sm">
            <Send className="size-3.5" />تسليم ملف
          </button>
        </>}
      />

      <PageBody>
        {/* ملفات لسه ماتسلمتش */}
        {pending.length > 0 && (
          <div className="flex animate-fade-in flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-warning/30 bg-warning/[0.06] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning">
                <Clock className="size-4" />
              </span>
              <p className="text-sm font-medium text-warning">
                <span className="tabular-nums">{pending.length}</span> ملف لم يُسلَّم بعد
              </p>
            </div>
            <button onClick={() => openDeliver()}
              className="eg-btn-subtle eg-btn-sm text-warning hover:bg-warning/10 hover:text-warning">
              تسليم الآن<ArrowLeft className="size-3.5" />
            </button>
          </div>
        )}

        <div className="eg-card overflow-hidden !p-0">
          {filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="eg-table min-w-[880px]">
                <thead>
                  <tr>
                    <th>اسم الملف</th><th>النوع</th><th>أمر الشغل / البند</th>
                    <th>تاريخ الاستلام</th><th>سُلِّم لـ</th><th>تاريخ التسليم</th>
                    <th className="w-24"><span className="sr-only">إجراء</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(f => (
                    <tr key={f.id}>
                      <td className="max-w-[280px]">
                        <div className="flex items-center gap-2">
                          <FileText aria-hidden className="size-4 shrink-0 text-muted" />
                          <span className="font-medium text-text">{f.file_name}</span>
                        </div>
                      </td>
                      <td>{f.file_type ? <Badge label={f.file_type} /> : <span className="text-muted">—</span>}</td>
                      <td className="max-w-[240px]">
                        {f.work_order?.wo_number
                          ? <span className="font-mono text-[13px] font-semibold text-accent">{f.work_order.wo_number}</span>
                          : <span className="text-muted">—</span>}
                        {fileItems(f).length > 0 && (
                          <div className="truncate text-[11px] text-subtext" title={fileItemsLabel(f)}>
                            {fileItems(f).length > 1 && <span className="ml-1 font-semibold text-accent">{fileItems(f).length} بنود:</span>}
                            {fileItemsLabel(f)}
                          </div>
                        )}
                      </td>
                      <td className="tabular-nums text-subtext">{f.receive_date ?? "—"}</td>
                      <td className="text-text">{f.supervisor?.name ?? <Badge label="لم يُسلَّم" tone="warning" />}</td>
                      <td className="tabular-nums text-subtext">{f.delivery_date ?? "—"}</td>
                      <td className="text-end">
                        {!f.delivered_to && (
                          <button onClick={() => openDeliver(f.id)} className="eg-btn-success eg-btn-xs">
                            <Send className="size-3.5" />تسليم
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={FolderOpen}
              message={files.length ? "مفيش ملفات مطابقة للبحث" : "لا توجد ملفات"}
              description={!files.length ? "سجّل أول ملف مستلم علشان يظهر هنا." : undefined}
              action={search
                ? <button onClick={() => setSearch("")} className="eg-btn-ghost eg-btn-sm">مسح البحث</button>
                : !files.length
                  ? <button onClick={() => setRecvOpen(true)} className="eg-btn-primary eg-btn-sm"><Download className="size-3.5" />استلام ملف</button>
                  : undefined}
            />
          )}
        </div>
      </PageBody>

      {/* استلام ملف */}
      <Modal open={recvOpen} onClose={() => setRecvOpen(false)} title="تسجيل استلام ملف">
        <form onSubmit={recvFile} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="أمر الشغل">
              <select value={recvForm.wo_id} onChange={e => setRecvForm(f => ({ ...f, wo_id: e.target.value, item_ids: [] }))}
                className="eg-select" autoFocus>
                <option value="">— بدون أمر شغل —</option>
                {wos.map(w => <option key={w.id} value={w.id}>{w.wo_number}</option>)}
              </select>
            </Field>
          </div>
          {recvNeedsItem && (
            <Field label={<span className="flex items-center justify-between gap-2">
                <span>البنود اللي الملف يخصها <span className="text-danger">*</span></span>
                {recvItems.length > 1 && (
                  <button type="button" className="eg-link text-[11px]"
                    onClick={() => setRecvForm(f => ({ ...f, item_ids: allRecvItems ? [] : recvItems.map(it => String(it.id)) }))}>
                    {allRecvItems ? "إلغاء الكل" : "اختيار الكل"}
                  </button>
                )}
              </span>}
              hint={recvItems.length === 0
                ? <span className="text-warning">الأمر ده لسه مالوش بنود — ضيف البنود من صفحة الأمر الأول</span>
                : `متحدد ${recvForm.item_ids.length} من ${recvItems.length}`}>
              {recvItems.length > 0 && (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/70 bg-card2/40 p-1.5">
                  {recvItems.map(it => {
                    const id = String(it.id);
                    const on = recvForm.item_ids.includes(id);
                    return (
                      <label key={it.id} className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${on ? "bg-accent/10 text-text" : "text-subtext hover:bg-card3/60 hover:text-text"}`}>
                        <input type="checkbox" checked={on} onChange={() => toggleRecvItem(id)} />
                        <span className="font-mono text-[12px] text-accent">#{it.item_no}</span>
                        <span className="truncate">{it.description}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </Field>
          )}
          <Field label="اسم الملف" required>
            <input value={recvForm.file_name} onChange={e => setRecvForm(f => ({ ...f, file_name: e.target.value }))}
              className="eg-input" placeholder="مثال: مخطط كهربي - WO2026" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="نوع الملف">
              <select value={recvForm.file_type} onChange={e => setRecvForm(f => ({ ...f, file_type: e.target.value }))} className="eg-select">
                {FILE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="تاريخ الاستلام">
              <input type="date" value={recvForm.receive_date} onChange={e => setRecvForm(f => ({ ...f, receive_date: e.target.value }))} className="eg-input" />
            </Field>
          </div>
          <button type="submit" disabled={saving || !recvValid} className="eg-btn-primary w-full">
            {saving ? <Spinner /> : <Download className="size-4" />}
            {saving ? "جاري الحفظ..." : "تسجيل الاستلام"}
          </button>
        </form>
      </Modal>

      {/* تسليم ملف */}
      <Modal open={deliverOpen} onClose={() => setDeliverOpen(false)} title="تسليم ملف لمشرف">
        <form onSubmit={deliverFile} className="space-y-4">
          <Field label="الملف" required hint={pending.length === 0 ? "لا توجد ملفات معلقة" : undefined}>
            <select value={deliverForm.file_id} onChange={e => setDeliverForm(f => ({ ...f, file_id: e.target.value }))}
              className="eg-select" autoFocus>
              <option value="">اختر ملف...</option>
              {pending.map(f => (
                <option key={f.id} value={f.id}>
                  {[f.file_name, f.work_order?.wo_number, fileItemsLabel(f)].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="المشرف المستلم" required
            hint={supervisors.length === 0
              ? <span className="text-warning">لا يوجد مشرفين — أضف فنيين بدرجة &quot;مشرف&quot; أولاً</span>
              : undefined}>
            <select value={deliverForm.supervisor_id} onChange={e => setDeliverForm(f => ({ ...f, supervisor_id: e.target.value }))} className="eg-select">
              <option value="">اختر مشرف...</option>
              {supervisors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="تاريخ التسليم">
            <input type="date" value={deliverForm.delivery_date} onChange={e => setDeliverForm(f => ({ ...f, delivery_date: e.target.value }))} className="eg-input" />
          </Field>
          <button type="submit" disabled={saving || !deliverForm.file_id || !deliverForm.supervisor_id}
            className="eg-btn-success w-full">
            {saving ? <Spinner /> : <Send className="size-4" />}
            {saving ? "جاري الحفظ..." : "تسجيل التسليم"}
          </button>
        </form>
      </Modal>
    </Page>
  );
}
