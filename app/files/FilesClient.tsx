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
  work_order?: { wo_number: string }; item?: { item_no: number; description: string } | null;
  supervisor?: { name: string };
};
type ItemLite = { id: number; wo_id: number; item_no: number; description: string };

const itemLabel = (it?: { item_no: number; description: string } | null) =>
  it ? `#${it.item_no} ${it.description}` : "";

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
  const emptyRecv = () => ({ wo_id: "", item_id: "", file_name: "", file_type: FILE_TYPES[0], receive_date: today() });
  const [recvForm, setRecvForm] = useState(emptyRecv);
  const [deliverForm, setDeliverForm] = useState({ file_id: "", supervisor_id: "", delivery_date: today() });

  const pending = files.filter(f => !f.delivered_to);
  const filtered = files.filter(f =>
    !search || f.file_name.toLowerCase().includes(search.toLowerCase()) ||
    (f.work_order?.wo_number ?? "").includes(search) ||
    (f.item?.description ?? "").includes(search)
  );

  // بنود الأمر المختار في فورم الاستلام — الملف بيتسجل على بند
  const recvItems = items.filter(it => String(it.wo_id) === recvForm.wo_id);
  const recvNeedsItem = recvForm.wo_id !== "";
  const recvValid = !!recvForm.file_name.trim() && (!recvNeedsItem || !!recvForm.item_id);

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
      work_order_item_id: recvForm.item_id ? parseInt(recvForm.item_id) : null,
      file_name: recvForm.file_name,
      file_type: recvForm.file_type,
      receive_date: recvForm.receive_date || today(),
    }).select(`*, work_order:work_orders(wo_number), item:work_order_items(item_no, description), supervisor:technicians(name)`).single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    notify(data.id, "received");
    setFiles(prev => [data, ...prev]);
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
                        {f.item && <div className="truncate text-[11px] text-subtext">{itemLabel(f.item)}</div>}
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
              <select value={recvForm.wo_id} onChange={e => setRecvForm(f => ({ ...f, wo_id: e.target.value, item_id: "" }))}
                className="eg-select" autoFocus>
                <option value="">— بدون أمر شغل —</option>
                {wos.map(w => <option key={w.id} value={w.id}>{w.wo_number}</option>)}
              </select>
            </Field>
            <Field label="البند" required={recvNeedsItem}
              hint={recvNeedsItem && recvItems.length === 0
                ? <span className="text-warning">الأمر ده لسه مالوش بنود — ضيف البنود من صفحة الأمر الأول</span>
                : !recvNeedsItem ? "اختار أمر الشغل الأول" : undefined}>
              <select value={recvForm.item_id} onChange={e => setRecvForm(f => ({ ...f, item_id: e.target.value }))}
                disabled={!recvNeedsItem || recvItems.length === 0} className="eg-select">
                <option value="">{recvNeedsItem ? "اختار البند..." : "—"}</option>
                {recvItems.map(it => <option key={it.id} value={it.id}>{itemLabel(it)}</option>)}
              </select>
            </Field>
          </div>
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
                  {[f.file_name, f.work_order?.wo_number, itemLabel(f.item)].filter(Boolean).join(" · ")}
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
