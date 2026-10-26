"use client";
import { useEffect, useMemo, useState } from "react";
import type { ClipboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import Field from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import Tooltip from "@/components/ui/Tooltip";
import { Page, PageHeader, PageBody, SectionHeader } from "@/components/ui/Page";
import { ProgressBar } from "@/components/ui/StatCard";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  Save, Plus, X, Pencil, Trash2, Printer, Check, ClipboardList, FileText, ListOrdered, ListChecks, Layers,
  Lock, ChevronLeft, CheckCircle2, Circle, Send, BadgeCheck, Info, AlertTriangle,
  BarChart3, Factory, Boxes, ShoppingCart, FolderOpen, KeyRound, type LucideIcon,
} from "lucide-react";
import { today, cn } from "@/lib/utils";
import { toneFor } from "@/lib/status";
import { deptLabel } from "@/lib/roles";
import { downloadDispenseNote } from "@/lib/dispense-note";
import { quantityToArabicWords } from "@/lib/arabic-words";

const STATUSES = ["لم يبدأ", "جاري", "متوقف", "مكتمل", "تم التسليم"];

// حالات قسم التجميع الميكانيكي (MECH_ASSEMBLY): بتتخزن بالمفتاح الإنجليزي
const MECH_STATUS_OPTIONS = [
  { key: "New", label: "جديد" },
  { key: "Partially Ready", label: "جاهز جزئياً" },
  { key: "Ready to Start", label: "جاهز للبدء" },
  { key: "In Progress", label: "جاري" },
  { key: "Partially Blocked", label: "متعطل جزئياً" },
  { key: "Blocked", label: "متعطل" },
  { key: "Packing", label: "تعبئة" },
  { key: "Finished", label: "منتهي" },
  { key: "Closed", label: "مغلق" },
];
const DEPT_STATUS_OPTIONS = ["لم يبدأ", "جاري", "متوقف", "مكتمل"];
const isMechDept = (dept: string) => dept === "MECH_ASSEMBLY";
// الحالات القديمة (زي "لم يبدأ") بتتحول لـ "جديد" في قسم التجميع الميكانيكي
const normalizeDeptStatus = (dept: string, status: string) =>
  !isMechDept(dept) ? status : (MECH_STATUS_OPTIONS.some(o => o.key === status) ? status : "New");
const isDeptDone = (dept: string, status: string) =>
  isMechDept(dept) ? status === "Finished" : status === "مكتمل";
// الاسم العربي لحالة التجميع الميكانيكي (للعرض بس)
const mechLabel = (key: string) => MECH_STATUS_OPTIONS.find(o => o.key === key)?.label ?? key;
const PRIORITIES = ["منخفضة", "متوسطة", "عالية", "عاجلة"];
const DONE = ["مكتمل", "تم التسليم"];
const CHECKLIST = [
  { key: "chk_client", label: "استلمه العميل" },
  { key: "chk_quality", label: "استلمه قسم الجودة" },
  { key: "chk_assembly", label: "تم الانتهاء من التجميع الكهربي" },
] as const;
const PROD_STAGES = [
  { key: "sheet", col: "qty_sheet", label: "الصاج" },
  { key: "paint", col: "qty_paint", label: "الدهان" },
  { key: "assembly", col: "qty_assembly", label: "التجميع" },
] as const;
type StageKey = "sheet" | "paint" | "assembly";
type Tab = "prod" | "files" | "purchases" | "prodlist" | "bom";

// بيقسم نص Excel المنسوخ لصفوف وخلايا، ويحترم الخلايا اللي فيها أسطر جديدة بين علامتي تنصيص
const parseExcelClipboard = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const clean = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  while (i < clean.length) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === "\t") { row.push(cell); cell = ""; i++; continue; }
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += ch; i++;
  }
  row.push(cell);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
};

const PROD_COLS = ["qty", "description", "part_no", "sheet_steel", "thickness"] as const;
type ProdDraft = { qty: string; description: string; part_no: string; sheet_steel: string; thickness: string; required_painting: "YES" | "NA" };
const emptyProdDraft = (): ProdDraft => ({ qty: "1", description: "", part_no: "", sheet_steel: "", thickness: "", required_painting: "YES" });

const BOM_COLS = ["s_no", "qty", "unit", "description", "part_no", "remark"] as const;
type BomDraft = { s_no: string; qty: string; unit: string; description: string; part_no: string; remark: string };
const emptyBomDraft = (): BomDraft => ({ s_no: "", qty: "1", unit: "", description: "", part_no: "", remark: "" });

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

export default function WODetailClient({
  wo, productivity, files, purchases, initialProdItems, initialBomItems, deptStatus, myDeptCode, initialItems, initialTotalBom, isDesign, currentUserName, currentUserEmail, departmentAliases, role, department,
}: {
  wo: any; productivity: any[]; files: any[]; purchases: any[];
  initialProdItems: any[]; deptStatus: { item_id: number; department: string; status: string }[];
  myDeptCode: string | null;
  initialItems: any[];
  initialTotalBom: any[];
  isDesign: boolean;
  currentUserName: string;
  currentUserEmail: string;
  departmentAliases: { code: string; aliases: string[] }[];
  initialBomItems: any[]; role: string; department: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const todayStr = today();
  const canManageLists = role === "manager";
  const isManager = role === "manager";
  // فورم إضافة البند وزرار حذفه: مكتب التصميم بس (المدير حتى لو قسمه تصميم مايشوفهمش)
  const isDesignOnly = isDesign && !isManager;
  // بيانات الأمر (الحالة، الأولوية، التسليم، شهر الخطة، العميل، المشروع، الوصف): المدير بس، ومكتب التصميم مايعدلهاش بعد الإنشاء
  const canEditOrder = isManager && !isDesign;

  /* ─────────── حذف الأمر بكل اللي يخصه (المدير بس، بكلمة المرور) ─────────── */
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState("");

  const closeDelete = () => { if (delBusy) return; setDelOpen(false); setDelPw(""); setDelError(""); };

  const deleteOrder = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (delBusy || !delPw) return;
    if (!currentUserEmail) { setDelError("مش لاقي الإيميل بتاعك"); return; }
    setDelBusy(true); setDelError("");
    // نتأكد من كلمة المرور الأول، والدالة في الداتابيز بتتأكد إن المستخدم مدير
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: currentUserEmail, password: delPw });
    if (authErr) { setDelBusy(false); setDelError("كلمة المرور غلط"); return; }
    const { error } = await supabase.rpc("delete_work_order", { p_wo_id: wo.id });
    if (error) { setDelBusy(false); setDelError(error.message); return; }
    toast.success(`تم حذف أمر الشغل ${wo.wo_number}`);
    router.push("/work-orders");
    router.refresh();
  };

  // تحويل أي قيمة قسم قديمة للـ code (زي resolve_department في الداتابيز)
  const resolveDeptCode = (raw: string | null | undefined) => {
    const v = (raw ?? "").trim().toLowerCase();
    if (!v) return null;
    return departmentAliases.find(d => d.aliases.some(a => a.trim().toLowerCase() === v))?.code ?? null;
  };
  // الصرف: المدير أي بند، والباقي بنود قسمه بس
  const canDispense = (it: any) =>
    isManager || (myDeptCode !== null && resolveDeptCode(it.department) === myDeptCode);

  /* ─────────── بيانات الأمر (تعديل) ─────────── */
  // الحالة والأولوية والتسليم وشهر الخطة بقوا على البند (مش على الأمر)
  const [status, setStatus] = useState<string>(wo.status);
  const [desc, setDesc] = useState<string>(wo.description ?? "");
  const [clientName, setClientName] = useState<string>(wo.client_name ?? "");
  const [projectName, setProjectName] = useState<string>(wo.project_name ?? "");

  // ── حالة الأقسام + الحالة العامة (من الداتابيز) ──
  const canSetStatus = canEditOrder; // الحالة العامة للأمر: المدير بس
  const [deptRows, setDeptRows] = useState(deptStatus);
  // أي تحديث من صفحة قسم التجميع (أو أي مكان تاني) بيتعكس هنا
  useEffect(() => { setDeptRows(deptStatus); }, [deptStatus]);
  const [statusConfirm, setStatusConfirm] = useState<{ next: string; incomplete: string[] } | null>(null);

  const changeStatus = async (next: string, force: boolean) => {
    setSaving(true);
    const { data, error } = await supabase.rpc("set_work_order_status", {
      p_wo_id: wo.id, p_status: next, p_force: force,
    });
    setSaving(false);
    if (error) { flash(false, error.message); return; }
    const res = data as { changed: boolean; needs_confirm: boolean; incomplete: string[] };
    if (res.needs_confirm) { setStatusConfirm({ next, incomplete: res.incomplete }); return; }
    setStatus(next);
    setStatusConfirm(null);
    flash(true, "تم تغيير حالة الأمر");
    router.refresh();
  };

  const changeDeptStatus = async (dept: string, next: string) => {
    if (activeItemId == null) return;
    const { error } = await supabase.rpc("set_item_department_status", { p_item_id: activeItemId, p_dept: dept, p_status: next });
    if (error) { flash(false, error.message); return; }
    setDeptRows(prev => prev.map(d => (d.item_id === activeItemId && d.department === dept) ? { ...d, status: next } : d));
    flash(true, `تم تحديث حالة ${deptLabel(dept)}`);
  };


  const [checks, setChecks] = useState({
    chk_client: !!wo.chk_client, chk_quality: !!wo.chk_quality, chk_assembly: !!wo.chk_assembly,
  });
  const [dirtyInfo, setDirtyInfo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("prod");

  // إشعار سريع (toast) بدل الرسالة اللي كانت بتظهر جوه الصفحة
  const flash = (ok: boolean, text: string) => toast.show(ok, text);


  const saveInfo = async () => {
    if (saving) return;
    setSaving(true);
    const patch: any = {
      description: desc.trim() || null,
      client_name: clientName.trim() || null,
      project_name: projectName.trim() || null,
      ...checks,
    };
    const { error } = await supabase.from("work_orders").update(patch).eq("id", wo.id);
    setSaving(false);
    if (error) { flash(false, error.message); return; }
    setDirtyInfo(false);
    flash(true, "تم حفظ بيانات الأمر");
    router.refresh();
  };

  const setInfo = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirtyInfo(true); };

  /* ─────────── قائمة إنتاج الأمر ─────────── */
  // ── مكتب التصميم: البنود (كل بند له اعتماده) و Total BOM ──
  const [items, setItems] = useState<any[]>(initialItems);
  // متأخر لو أي بند عنده موعد تسليم فات ولسه ماتسلمش
  const isLate = items.some(it => !!it.expected_delivery && it.expected_delivery < todayStr && !DONE.includes(it.job_status));
  const [totalBom] = useState<any[]>(initialTotalBom);   // مقفول: للقراءة بس
  const [activeItemId, setActiveItemId] = useState<number | null>(initialItems[0]?.id ?? null);
  const activeItem = items.find(it => it.id === activeItemId) ?? null;
  // BOM وقائمة الإنتاج للبند: المدير أي وقت، ومكتب التصميم بعد اعتماد البند بس
  const canAddChildren = isManager || (isDesign && activeItem?.status === "approved");
  const activeDeptRows = deptRows.filter(d => d.item_id === activeItemId);
  const deptDoneCount = activeDeptRows.filter(d => isDeptDone(d.department, d.status)).length;
  const [newItem, setNewItem] = useState({ description: "", qty: "1" });
  const [busyDesign, setBusyDesign] = useState(false);

  const sendItem = async (id: number) => {
    setBusyDesign(true);
    const { error } = await supabase.rpc("design_send_item", { p_item_id: id });
    setBusyDesign(false);
    if (error) { flash(false, error.message); return; }
    setItems(prev => prev.map(it => it.id === id ? { ...it, status: "pending", sent_at: new Date().toISOString() } : it));
    flash(true, "تم إرسال البند للاعتماد");
  };

  const approveItem = async (id: number) => {
    setBusyDesign(true);
    const { error } = await supabase.rpc("design_approve_item", { p_item_id: id });
    setBusyDesign(false);
    if (error) { flash(false, error.message); return; }
    setItems(prev => prev.map(it => it.id === id ? { ...it, status: "approved", approved_at: new Date().toISOString() } : it));
    flash(true, "تم اعتماد البند");
  };

  const updateItemField = async (id: number, patch: Record<string, any>) => {
    const { error } = await supabase.from("work_order_items").update(patch).eq("id", id);
    if (error) { flash(false, error.message); return; }
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
    router.refresh();
  };

  const addItem = async () => {
    if (!newItem.description.trim() || busyDesign) return;
    const nextNo = items.reduce((m, it) => Math.max(m, it.item_no ?? 0), 0) + 1;
    setBusyDesign(true);
    const { data, error } = await supabase.from("work_order_items").insert({
      wo_id: wo.id, item_no: nextNo, description: newItem.description.trim(),
      qty: parseFloat(newItem.qty) || 1,
    }).select("*").single();
    setBusyDesign(false);
    if (error) { flash(false, error.message); return; }
    setItems(prev => [...prev, data]);
    setActiveItemId(prev => prev ?? data.id);
    setNewItem({ description: "", qty: "1" });
    flash(true, "تم إضافة البند");
  };

  const removeItem = async (id: number) => {
    const target = items.find(it => it.id === id);
    const ok = await confirm({
      title: target ? `حذف البند #${target.item_no}؟` : "حذف البند؟",
      message: "هيتحذف معاه BOM وقائمة الإنتاج الخاصين بيه.",
      confirmText: "حذف البند",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("work_order_items").delete().eq("id", id);
    if (error) { flash(false, error.message); return; }
    setItems(prev => {
      const next = prev.filter(it => it.id !== id);
      if (activeItemId === id) setActiveItemId(next[0]?.id ?? null);
      return next;
    });
    flash(true, "تم حذف البند");
  };

  const [prodItems, setProdItems] = useState<any[]>(initialProdItems);
  const [draftRows, setDraftRows] = useState<ProdDraft[]>([emptyProdDraft()]);
  const [savingProdList, setSavingProdList] = useState(false);
  const [editProdItem, setEditProdItem] = useState<any>(null);
  const [editProdForm, setEditProdForm] = useState<ProdDraft>(emptyProdDraft());
  const [savingEditProd, setSavingEditProd] = useState(false);
  const [logStage, setLogStage] = useState<{ item: any; stage: StageKey } | null>(null);
  const [logQty, setLogQty] = useState("");
  const [logging, setLogging] = useState(false);

  const prodTotals = useMemo(() => {
    const qty = prodItems.reduce((a, it) => a + (it.qty ?? 0), 0);
    const sum = (k: string) => prodItems.reduce((a, it) => a + (it[k] ?? 0), 0);
    return { qty, sheet: sum("qty_sheet"), paint: sum("qty_paint"), assembly: sum("qty_assembly") };
  }, [prodItems]);

  const openLogStage = (item: any, stage: StageKey) => { setLogStage({ item, stage }); setLogQty(""); };

  const submitLogStage = async () => {
    if (!logStage || logging) return;
    const q = parseFloat(logQty);
    if (!q || q <= 0) { toast.warning("أدخل كمية صحيحة"); return; }
    setLogging(true);
    const { error } = await supabase.rpc("log_production", {
      p_item_id: logStage.item.id, p_stage: logStage.stage, p_qty: q, p_note: null,
    });
    setLogging(false);
    if (error) { flash(false, error.message); return; }
    const col = `qty_${logStage.stage}`;
    setProdItems(prev => prev.map(it => it.id === logStage.item.id ? { ...it, [col]: (it[col] ?? 0) + q } : it));
    setLogStage(null);
    flash(true, "تم تسجيل الإنتاج");
  };

  const handleProdPaste = (e: ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = parseExcelClipboard(text);
    setDraftRows(prev => {
      const updated = [...prev];
      lines.forEach((cells, i) => {
        const t = rowIdx + i;
        while (updated.length <= t) updated.push(emptyProdDraft());
        const row: any = { ...updated[t] };
        cells.forEach((val, j) => { const c = PROD_COLS[colIdx + j]; if (c) row[c] = val.trim(); });
        updated[t] = row;
      });
      return updated;
    });
  };

  const updateProdDraft = (idx: number, patch: Partial<ProdDraft>) =>
    setDraftRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeProdDraft = (idx: number) =>
    setDraftRows(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyProdDraft()]));

  const saveProdList = async () => {
    if (savingProdList) return;
    const rows = draftRows.filter(r => r.description.trim()).map(r => ({
      work_order_id: wo.id,
      work_order_item_id: activeItemId,
      qty: parseFloat(r.qty) || 1,
      description: r.description.trim(),
      part_no: r.part_no.trim() || null,
      sheet_steel: r.sheet_steel.trim() || null,
      thickness: r.thickness.trim() || null,
      required_painting: r.required_painting,
    }));
    if (rows.length === 0) return;
    setSavingProdList(true);
    const { data, error } = await supabase.from("wo_production_items").insert(rows).select("*");
    setSavingProdList(false);
    if (error) { flash(false, error.message); return; }
    setProdItems(prev => [...prev, ...(data ?? [])]);
    setDraftRows([emptyProdDraft()]);
    flash(true, `تم إضافة ${rows.length} بند`);
  };

  const openEditProdItem = (item: any) => {
    setEditProdItem(item);
    setEditProdForm({
      qty: String(item.qty), description: item.description, part_no: item.part_no ?? "",
      sheet_steel: item.sheet_steel ?? "", thickness: item.thickness ?? "",
      required_painting: item.required_painting ?? "YES",
    });
  };

  const submitEditProdItem = async () => {
    if (!editProdItem || savingEditProd) return;
    const payload = {
      qty: parseFloat(editProdForm.qty) || 1,
      description: editProdForm.description.trim(),
      part_no: editProdForm.part_no.trim() || null,
      sheet_steel: editProdForm.sheet_steel.trim() || null,
      thickness: editProdForm.thickness.trim() || null,
      required_painting: editProdForm.required_painting,
    };
    setSavingEditProd(true);
    const { error } = await supabase.from("wo_production_items").update(payload).eq("id", editProdItem.id);
    setSavingEditProd(false);
    if (error) { flash(false, error.message); return; }
    setProdItems(prev => prev.map(it => (it.id === editProdItem.id ? { ...it, ...payload } : it)));
    setEditProdItem(null);
    flash(true, "تم حفظ التعديل");
  };

  const removeProdItem = async (itemId: number) => {
    const row = prodItems.find(it => it.id === itemId);
    const ok = await confirm({
      title: "حذف هذا الصف من قائمة الإنتاج؟",
      message: row?.description
        ? <>هيتحذف صف <span className="font-semibold text-text">{row.description}</span> من قائمة الإنتاج.</>
        : undefined,
      confirmText: "حذف الصف",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("wo_production_items").delete().eq("id", itemId);
    if (error) { flash(false, error.message); return; }
    setProdItems(prev => prev.filter(it => it.id !== itemId));
    flash(true, "تم حذف الصف");
  };

  /* ─────────── BOM ─────────── */
  const [bomItems, setBomItems] = useState<any[]>(initialBomItems);
  // غير المدير يشوف بنود قسمه بس
  const visibleBom = (isManager || isDesign) ? bomItems : bomItems.filter(it => canDispense(it));
  // BOM وقائمة الإنتاج بيتعرضوا للبند الحالي بس
  const scopedBom = activeItemId == null ? visibleBom : visibleBom.filter(it => it.work_order_item_id === activeItemId);
  const scopedProd = activeItemId == null ? prodItems : prodItems.filter(it => it.work_order_item_id === activeItemId);
  const [bomDraftRows, setBomDraftRows] = useState<BomDraft[]>([emptyBomDraft()]);
  const [savingBomList, setSavingBomList] = useState(false);
  const [editBomItem, setEditBomItem] = useState<any>(null);
  const [editBomForm, setEditBomForm] = useState<BomDraft>(emptyBomDraft());
  const [savingEditBom, setSavingEditBom] = useState(false);
  // المدير مش مرتبط بقسم، فبيختار القسم اللي البنود دي بتاعته
  const [bomDept, setBomDept] = useState("");
  const bomDeptEffective = (isManager || isDesign) ? bomDept : (department ?? "");
  // ── إذن صرف مواد: أكتر من بند في عملية واحدة ──
  const [dnSel, setDnSel] = useState<Record<number, string>>({});
  const [dnOpen, setDnOpen] = useState(false);
  const [dnProcess, setDnProcess] = useState("");
  const [dnReceiver, setDnReceiver] = useState("");
  const [dnEngineer, setDnEngineer] = useState(currentUserName);
  const [dnBusy, setDnBusy] = useState(false);

  const handleBomPaste = (e: ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const lines = parseExcelClipboard(text);
    setBomDraftRows(prev => {
      const updated = [...prev];
      lines.forEach((cells, i) => {
        const t = rowIdx + i;
        while (updated.length <= t) updated.push(emptyBomDraft());
        const row: any = { ...updated[t] };
        cells.forEach((val, j) => { const c = BOM_COLS[colIdx + j]; if (c) row[c] = val.trim(); });
        updated[t] = row;
      });
      return updated;
    });
  };

  const updateBomDraft = (idx: number, patch: Partial<BomDraft>) =>
    setBomDraftRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const removeBomDraft = (idx: number) =>
    setBomDraftRows(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyBomDraft()]));

  const saveBomList = async () => {
    if (savingBomList) return;
    const rows = bomDraftRows.filter(r => r.description.trim()).map(r => ({
      work_order_id: wo.id,
      work_order_item_id: activeItemId,
      s_no: r.s_no.trim() ? parseInt(r.s_no) : null,
      qty: parseFloat(r.qty) || 1,
      unit: r.unit.trim() || null,
      description: r.description.trim(),
      part_no: r.part_no.trim() || null,
      remark: r.remark.trim() || null,
      department: bomDeptEffective,
    }));
    if (rows.length === 0) return;
    setSavingBomList(true);
    const { data, error } = await supabase.from("wo_bom_items").insert(rows).select("*");
    setSavingBomList(false);
    if (error) { flash(false, error.message); return; }
    setBomItems(prev => [...prev, ...(data ?? [])]);
    setBomDraftRows([emptyBomDraft()]);
    flash(true, `تم إضافة ${rows.length} بند`);
  };

  const openEditBomItem = (item: any) => {
    setEditBomItem(item);
    setEditBomForm({
      s_no: item.s_no != null ? String(item.s_no) : "", qty: String(item.qty), unit: item.unit ?? "",
      description: item.description, part_no: item.part_no ?? "", remark: item.remark ?? "",
    });
  };

  const submitEditBomItem = async () => {
    if (!editBomItem || savingEditBom) return;
    const payload = {
      s_no: editBomForm.s_no.trim() ? parseInt(editBomForm.s_no) : null,
      qty: parseFloat(editBomForm.qty) || 1,
      unit: editBomForm.unit.trim() || null,
      description: editBomForm.description.trim(),
      part_no: editBomForm.part_no.trim() || null,
      remark: editBomForm.remark.trim() || null,
    };
    setSavingEditBom(true);
    const { error } = await supabase.from("wo_bom_items").update(payload).eq("id", editBomItem.id);
    setSavingEditBom(false);
    if (error) { flash(false, error.message); return; }
    setBomItems(prev => prev.map(it => (it.id === editBomItem.id ? { ...it, ...payload } : it)));
    setEditBomItem(null);
    flash(true, "تم حفظ التعديل");
  };

  const removeBomItem = async (itemId: number) => {
    const row = bomItems.find(it => it.id === itemId);
    const ok = await confirm({
      title: "حذف هذا البند من الـ BOM؟",
      message: row?.description
        ? <>هيتحذف <span className="font-semibold text-text">{row.description}</span> من الـ BOM.</>
        : undefined,
      confirmText: "حذف البند",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.from("wo_bom_items").delete().eq("id", itemId);
    if (error) { flash(false, error.message); return; }
    setBomItems(prev => prev.filter(it => it.id !== itemId));
    flash(true, "تم حذف البند من الـ BOM");
  };

  const toggleDnSel = (it: any) => setDnSel(prev => {
    const n = { ...prev };
    if (n[it.id] !== undefined) delete n[it.id];
    else n[it.id] = String((it.qty ?? 0) - (it.qty_dispensed ?? 0));
    return n;
  });

  const openDispenseFor = (it: any) => {
    setDnSel({ [it.id]: String((it.qty ?? 0) - (it.qty_dispensed ?? 0)) });
    setDnOpen(true);
  };

  const dnSelectedRows = bomItems.filter(it => dnSel[it.id] !== undefined);

  const submitDispenseNote = async () => {
    if (dnBusy) return;
    const items = Object.entries(dnSel).map(([id, q]) => ({ bom_item_id: Number(id), qty: parseFloat(q) }));
    if (items.length === 0) { toast.warning("اختار بند واحد على الأقل"); return; }
    if (items.some(i => !i.qty || i.qty <= 0)) { toast.warning("أدخل كمية صحيحة لكل بند"); return; }

    setDnBusy(true);
    const { data, error } = await supabase.rpc("dispense_bom_batch", {
      p_wo_id: wo.id,
      p_items: items,
      p_process: dnProcess.trim() || null,
      p_receiver: dnReceiver.trim() || null,
      p_engineer: dnEngineer.trim() || null,
    });
    setDnBusy(false);
    if (error) { flash(false, error.message); return; }

    const res = data as { id: number; note_no: string; items: any[] };
    setBomItems(prev => prev.map(it => {
      const line = items.find(i => i.bom_item_id === it.id);
      return line ? { ...it, qty_dispensed: (it.qty_dispensed ?? 0) + line.qty } : it;
    }));

    try {
      await downloadDispenseNote({
        noteNo: res.note_no,
        date: todayStr,
        woNumber: wo.wo_number,
        process: dnProcess.trim(),
        engineer: dnEngineer.trim(),
        receiver: dnReceiver.trim(),
        lines: res.items.map((l: any) => ({
          name: l.description, partNo: l.part_no ?? "", unit: l.unit ?? "",
          // المطلوب في الإذن = الكمية اللي اتطلبت في الإذن ده (مش إجمالي البند)
          requested: Number(l.dispensed), dispensed: Number(l.dispensed),
        })),
      });
    } catch (e) {
      flash(false, (e as Error).message);
    }

    setDnSel({}); setDnOpen(false); setDnProcess(""); setDnReceiver("");
    flash(true, `تم الصرف — إذن ${res.note_no}`);
  };

  const getImageUrl = (path: string) => supabase.storage.from("purchases").getPublicUrl(path).data.publicUrl;

  const TABS: { key: Tab; label: string; count: number; icon: LucideIcon }[] = [
    { key: "prod", label: "الإنتاجية", count: productivity.length, icon: BarChart3 },
    { key: "prodlist", label: "قائمة الإنتاج", count: prodItems.length, icon: Factory },
    { key: "bom", label: "BOM", count: bomItems.length, icon: Boxes },
    { key: "purchases", label: "المشتريات", count: purchases.length, icon: ShoppingCart },
    { key: "files", label: "الملفات", count: files.length, icon: FolderOpen },
  ];

  // سطر بيوضح البند الحالي اللي قائمة الإنتاج والـ BOM متفلترين عليه
  const activeItemNote = activeItem && (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ListOrdered className="size-3.5 shrink-0 text-muted" />
      البند
      <span className="max-w-[18rem] truncate font-medium text-text">#{activeItem.item_no} {activeItem.description}</span>
    </span>
  );

  return (
    <Page width="7xl">
      <PageHeader
        back={{ href: "/work-orders", label: "أوامر الشغل" }}
        icon={ClipboardList}
        title={<span className="font-mono">{wo.wo_number}</span>}
        meta={<>
          <Badge label={status} />
          {isLate && <Badge label="متأخر" tone="danger" />}
          {dirtyInfo && <Badge label="تعديلات غير محفوظة" tone="warning" />}
        </>}
        subtitle={<>
          أُنشئ <span className="tabular-nums">{wo.created_date ?? "—"}</span>
          {" · "}<span className="tabular-nums">{items.length}</span> بند
          {prodItems.length > 0 && <>{" · "}الإنجاز: <span className="tabular-nums text-text">{prodTotals.assembly}/{prodTotals.qty}</span> تجميع</>}
        </>}
        actions={<>
          {isManager && (
            <button type="button" onClick={() => setDelOpen(true)} className="eg-btn-danger-soft eg-btn-sm">
              <Trash2 className="size-3.5" />حذف الأمر
            </button>
          )}
          <button type="button" onClick={saveInfo} disabled={saving || !dirtyInfo || !canEditOrder} className="eg-btn-success eg-btn-sm">
            {saving ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
            {saving ? "جاري الحفظ..." : "حفظ البيانات"}
          </button>
        </>}
      />

      <PageBody>
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
          {/* ═══ العمود الرئيسي ═══ */}
          <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
            {/* ═══ بيانات الأمر ═══ */}
            <fieldset disabled={!canEditOrder} className="contents">
              <section className="eg-card space-y-4">
                <SectionHeader
                  title="بيانات الأمر"
                  icon={FileText}
                  actions={!canEditOrder && (
                    <Badge label="للقراءة فقط" tone="neutral" dot={false}>
                      <Lock className="size-3" />للقراءة فقط، بيعدّلها المدير
                    </Badge>
                  )}
                />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="اسم العميل">
                    <input value={clientName} onChange={e => setInfo<string>(setClientName)(e.target.value)} className="eg-input" />
                  </Field>
                  <Field label="اسم المشروع">
                    <input value={projectName} onChange={e => setInfo<string>(setProjectName)(e.target.value)} className="eg-input" />
                  </Field>
                </div>
                <Field label="وصف الأمر">
                  <textarea rows={3} value={desc} onChange={e => setInfo<string>(setDesc)(e.target.value)}
                    className="eg-input resize-y" placeholder="المنتج، المطلوب، ملاحظات التنفيذ..." />
                </Field>
              </section>
            </fieldset>

            {/* ═══ البنود (كل بند ليه اعتماده) ═══ */}
            <section className="eg-card overflow-hidden !p-0">
              <SectionHeader
                className="px-4 pb-3 pt-4 sm:px-5"
                title="بنود الأمر"
                icon={ListOrdered}
                actions={items.length > 0 && (
                  <label className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] text-subtext">البند الحالي للـ BOM والإنتاج:</span>
                    <select value={activeItemId ?? ""} onChange={e => setActiveItemId(Number(e.target.value))}
                      className="eg-select eg-input-sm w-56 max-w-full">
                      {items.map(it => <option key={it.id} value={it.id}>#{it.item_no} {it.description}</option>)}
                    </select>
                  </label>
                )}
              />
              {items.length > 0 ? (
                <div className="overflow-x-auto border-t border-border/60">
                  <table className={cn("eg-table eg-table-compact", isDesignOnly ? "min-w-[560px]" : "min-w-[860px]")}>
                    <thead>
                      <tr>
                        <th className="w-14 text-center">#</th>
                        <th className="min-w-[160px]">الوصف</th>
                        <th className="w-20 text-center">الكمية</th>
                        {/* الحالة والأولوية والتسليم وشهر الخطة: مكتب التصميم مايشوفهمش */}
                        {!isDesignOnly && <>
                          <th className="w-28 text-center">الحالة</th>
                          <th className="w-24 text-center">الأولوية</th>
                          <th className="w-32 text-center">التسليم المتوقع</th>
                          <th className="w-28 text-center">شهر الخطة</th>
                        </>}
                        <th className="w-36 text-center">التجميع الميكانيكي</th>
                        <th className="w-44 text-center">الاعتماد</th>
                        <th className="w-10"><span className="sr-only">إجراءات</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(it => {
                        const selected = activeItemId === it.id;
                        const itemLate = !!it.expected_delivery && it.expected_delivery < todayStr && !DONE.includes(it.job_status);
                        const mech = deptRows.find(d => d.item_id === it.id && d.department === "MECH_ASSEMBLY");
                        const mechKey = mech ? normalizeDeptStatus("MECH_ASSEMBLY", mech.status) : null;
                        return (
                          <tr key={it.id} onClick={() => setActiveItemId(it.id)}
                            className={cn("cursor-pointer", selected && "bg-accent/[0.06]")}>
                            <td className={cn("text-center font-mono font-semibold text-accent",
                              selected && "shadow-[inset_-2px_0_0_rgb(var(--accent))]")}>
                              {it.item_no}
                            </td>
                            <td className={cn("text-text", selected && "font-medium")}>{it.description}</td>
                            <td className="text-center tabular-nums">{it.qty}</td>
                            {!isDesignOnly && <>
                              <td className="text-center" onClick={e => e.stopPropagation()}>
                                {isManager ? (
                                  <select value={it.job_status} onChange={e => updateItemField(it.id, { job_status: e.target.value })}
                                    aria-label={`حالة البند #${it.item_no}`} className="eg-select eg-input-sm mx-auto w-24">
                                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                                  </select>
                                ) : it.job_status ? <Badge label={it.job_status} /> : <span className="text-muted">—</span>}
                              </td>
                              <td className="text-center" onClick={e => e.stopPropagation()}>
                                {isManager ? (
                                  <select value={it.priority} onChange={e => updateItemField(it.id, { priority: e.target.value })}
                                    aria-label={`أولوية البند #${it.item_no}`} className="eg-select eg-input-sm mx-auto w-20">
                                    {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                                  </select>
                                ) : it.priority ? <Badge label={it.priority} dot={false} /> : <span className="text-muted">—</span>}
                              </td>
                              <td className="text-center tabular-nums" onClick={e => e.stopPropagation()}>
                                {isManager ? (
                                  <input type="date" value={it.expected_delivery ?? ""}
                                    onChange={e => updateItemField(it.id, { expected_delivery: e.target.value || null })}
                                    aria-label={`التسليم المتوقع للبند #${it.item_no}`}
                                    className={cn("eg-input eg-input-sm mx-auto w-32", itemLate && "text-danger")} />
                                ) : (
                                  <span className={itemLate ? "font-semibold text-danger" : "text-subtext"}>{it.expected_delivery ?? "—"}</span>
                                )}
                              </td>
                              <td className="text-center tabular-nums" onClick={e => e.stopPropagation()}>
                                {isManager ? (
                                  <input type="month" value={it.plan_month ?? ""}
                                    onChange={e => updateItemField(it.id, { plan_month: e.target.value || null })}
                                    aria-label={`شهر الخطة للبند #${it.item_no}`}
                                    className="eg-input eg-input-sm mx-auto w-28" />
                                ) : <span className="text-subtext">{it.plan_month ?? "—"}</span>}
                              </td>
                            </>}
                            <td className="text-center">
                              {mechKey
                                ? <Badge label={mechLabel(mechKey)} tone={toneFor(mechKey)} />
                                : <span className="text-muted">—</span>}
                            </td>
                            <td className="text-center" onClick={e => e.stopPropagation()}>
                              {it.status === "approved" && <Badge label="معتمد" tone="success" />}
                              {it.status === "pending" && (
                                isDesign
                                  ? (
                                    <button type="button" onClick={() => approveItem(it.id)} disabled={busyDesign} className="eg-btn-success eg-btn-xs">
                                      <BadgeCheck className="size-3" />تسجيل الاعتماد
                                    </button>
                                  )
                                  : <Badge label="في انتظار الاعتماد" tone="warning" />
                              )}
                              {it.status === "draft" && (
                                isDesign
                                  ? (
                                    <button type="button" onClick={() => sendItem(it.id)} disabled={busyDesign} className="eg-btn-primary eg-btn-xs">
                                      <Send className="size-3" />إرسال للاعتماد
                                    </button>
                                  )
                                  : <Badge label="مسودة" tone="neutral" />
                              )}
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              {it.status === "draft" && isDesignOnly && (
                                <Tooltip content="حذف البند">
                                  <button type="button" onClick={() => removeItem(it.id)} className="eg-icon-btn-danger" aria-label={`حذف البند #${it.item_no}`}>
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </Tooltip>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState compact icon={ListOrdered} message="مفيش بنود بعد"
                  description={isDesignOnly ? "ضيف أول بند للأمر من الفورم اللي تحت." : undefined}
                  className="border-t border-border/60" />
              )}
              {isDesignOnly && (
                <form onSubmit={e => { e.preventDefault(); addItem(); }} noValidate
                  className="grid grid-cols-1 items-end gap-3 border-t border-border/60 bg-card2/30 px-4 py-3 sm:grid-cols-12 sm:px-5">
                  <Field label="وصف البند" className="sm:col-span-8">
                    <input value={newItem.description} onChange={e => setNewItem(f => ({ ...f, description: e.target.value }))}
                      className="eg-input eg-input-sm" />
                  </Field>
                  <Field label="الكمية" className="sm:col-span-2">
                    <input type="number" min="0.01" step="any" value={newItem.qty}
                      onChange={e => setNewItem(f => ({ ...f, qty: e.target.value }))} className="eg-input eg-input-sm" />
                  </Field>
                  <button type="submit" disabled={busyDesign || !newItem.description.trim()} className="eg-btn-primary eg-btn-sm sm:col-span-2">
                    {busyDesign ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />}إضافة بند
                  </button>
                </form>
              )}
              {activeItem && activeItem.status !== "approved" && (
                <p className="flex items-center gap-1.5 border-t border-border/60 bg-warning/[0.04] px-4 py-2.5 text-[11px] leading-4 text-warning sm:px-5">
                  <Info className="size-3.5 shrink-0" />BOM وقائمة الإنتاج للبند ده بيتضافوا بعد اعتماده
                </p>
              )}
            </section>
          </div>

          {/* ═══ العمود الجانبي ═══ */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* ═══ قائمة التحقق ═══ */}
            <fieldset disabled={!canEditOrder} className="contents">
              <section className="eg-card space-y-2">
                <SectionHeader
                  title="قائمة التحقق"
                  icon={ListChecks}
                  actions={
                    <span className="text-[11px] tabular-nums text-subtext">
                      {CHECKLIST.filter(c => checks[c.key]).length} / {CHECKLIST.length}
                    </span>
                  }
                />
                <div className="-mx-2">
                  {CHECKLIST.map(({ key, label }) => (
                    <label key={key}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-xs text-text transition-colors hover:bg-card2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:disabled]:hover:bg-transparent">
                      <input type="checkbox" checked={checks[key]}
                        onChange={e => setInfo<boolean>(v => setChecks(c => ({ ...c, [key]: v })))(e.target.checked)}
                        className="shrink-0 disabled:cursor-not-allowed" />
                      {label}
                    </label>
                  ))}
                </div>
              </section>
            </fieldset>

            {/* ═══ حالة الأقسام ═══ */}
            <section className="eg-card space-y-3">
              <SectionHeader
                title="حالة الأقسام"
                icon={Layers}
                description={activeItem ? `البند #${activeItem.item_no}` : undefined}
                actions={activeDeptRows.length > 0 && (
                  <span className="text-[11px] tabular-nums text-subtext">
                    {deptDoneCount} / {activeDeptRows.length} مكتمل
                  </span>
                )}
              />
              {activeDeptRows.length > 0 ? (
                <>
                  <ProgressBar
                    value={(deptDoneCount / activeDeptRows.length) * 100}
                    tone={deptDoneCount === activeDeptRows.length ? "success" : "accent"}
                    label="نسبة الأقسام المكتملة"
                  />
                  <div className="divide-y divide-border/50">
                    {activeDeptRows.map(d => {
                      const mine = role === "manager" || myDeptCode === d.department;
                      const done = isDeptDone(d.department, d.status);
                      return (
                        <div key={d.department} className="flex items-center justify-between gap-3 py-2">
                          <div className="flex min-w-0 items-center gap-2">
                            {done
                              ? <CheckCircle2 aria-hidden className="size-4 shrink-0 text-success" />
                              : <Circle aria-hidden className="size-4 shrink-0 text-muted" />}
                            <span className="truncate text-xs text-text">{deptLabel(d.department)}</span>
                          </div>
                          <select value={normalizeDeptStatus(d.department, d.status)} disabled={!mine}
                            onChange={e => changeDeptStatus(d.department, e.target.value)}
                            aria-label={`حالة ${deptLabel(d.department)}`}
                            className="eg-select eg-input-sm w-36 shrink-0">
                            {isMechDept(d.department)
                              ? MECH_STATUS_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)
                              : DEPT_STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="flex items-start gap-1.5 rounded-lg border border-warning/20 bg-warning/[0.06] px-3 py-2 text-[11px] leading-5 text-warning">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  مفيش أقسام مربوطة بالأمر (راجع migrations 008 و009)
                </p>
              )}
              {role !== "manager" && <p className="eg-hint">بتقدر تعدّل حالة قسمك بس، والحالة العامة للأمر بيعدّلها المدير.</p>}
            </section>

            {/* ═══ Total BOM: صفحة لوحدها ═══ */}
            <section className="eg-card !p-4">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-lg border",
                  totalBom.length > 0 ? "border-accent/25 bg-accent/10 text-accent" : "border-border bg-card2 text-subtext",
                )}>
                  {totalBom.length > 0 ? <Lock className="size-4" /> : <FileText className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-text">Total BOM (الأمر كله)</h2>
                  <p className="text-[11px] tabular-nums text-subtext">{totalBom.length > 0 ? `${totalBom.length} سطر — مقفول` : "لم يُكتب بعد"}</p>
                </div>
                <Link href={`/work-orders/${wo.id}/total-bom`} className="eg-btn-ghost eg-btn-sm shrink-0">
                  فتح Total BOM<ChevronLeft className="size-3.5" />
                </Link>
              </div>
            </section>
          </div>
        </div>

        {/* ═══ التبويبات ═══ */}
        <section className="space-y-4">
          <div className="border-b border-border/60">
            <Tabs
              value={tab}
              onChange={setTab}
              ariaLabel="تفاصيل الأمر"
              items={TABS.map(({ key, label, count, icon: Icon }) => ({
                value: key, label, count, icon: <Icon className="size-3.5" />,
              }))}
            />
          </div>

          {/* ═══ الإنتاجية ═══ */}
          {tab === "prod" && (
            <DataTable empty="لا توجد سجلات إنتاجية لهذا الأمر" icon={BarChart3}
              head={["الفني", "التاريخ", "المهمة", "ملاحظات"]}
              numeric={[1]}
              rows={productivity.map(p => [p.tech_name ?? "—", p.work_date, p.task, p.notes ?? "—"])} />
          )}

          {/* ═══ الملفات ═══ */}
          {tab === "files" && (
            <DataTable empty="لا توجد ملفات" icon={FolderOpen}
              head={["الملف", "البند", "النوع", "تاريخ الاستلام", "سُلِّم لـ", "تاريخ التسليم"]}
              numeric={[3, 5]}
              rows={files.map(f => [
                f.file_name,
                (f.file_items ?? []).map((x: any) => x.item).filter(Boolean)
                  .sort((a: any, b: any) => a.item_no - b.item_no)
                  .map((it: any) => `#${it.item_no} ${it.description}`).join("، ") || "—",
                f.file_type ? <Badge label={f.file_type} dot={false} /> : "—",
                f.receive_date ?? "—",
                f.supervisor_name ?? "—",
                f.delivery_date ?? "—",
              ])} />
          )}

          {/* ═══ المشتريات ═══ */}
          {tab === "purchases" && (
            purchases.length ? (
              <div className="eg-card overflow-hidden !p-0">
                <div className="overflow-x-auto">
                  <table className="eg-table eg-table-compact min-w-[640px]">
                    <thead>
                      <tr>
                        <th>الصنف</th>
                        <th>الكمية</th>
                        <th>الطلب</th>
                        <th>التوريد</th>
                        <th>الحالة</th>
                        <th>الصورة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchases.map((p: any, i) => {
                        const lateSupply = p.supply_date && p.supply_date < todayStr && p.status === "مفتوح";
                        return (
                          <tr key={i}>
                            <td className="text-text">{p.item_name}</td>
                            <td className="tabular-nums">{p.qty}</td>
                            <td className="tabular-nums text-subtext">{p.request_date ?? "—"}</td>
                            <td className={cn("tabular-nums", lateSupply ? "font-semibold text-danger" : "text-subtext")}>
                              {p.supply_date ?? "—"}
                            </td>
                            <td><Badge label={p.status} /></td>
                            <td>
                              {p.image_path
                                ? <a href={getImageUrl(p.image_path)} target="_blank" rel="noopener" className="eg-link text-xs">عرض</a>
                                : <span className="text-muted">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : <div className="eg-card"><EmptyState message="لا توجد طلبات شراء" icon={ShoppingCart} /></div>
          )}

          {/* ═══ قائمة الإنتاج ═══ */}
          {tab === "prodlist" && (
            <div className="space-y-4">
              {activeItemNote && <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtext">{activeItemNote}</p>}
              {scopedProd.length > 0 ? (
                <div className="eg-card overflow-hidden !p-0">
                  <div className="overflow-x-auto">
                    <table className="eg-table eg-table-compact min-w-[900px]">
                      <thead>
                        <tr>
                          <th className="w-14 text-center">Qty</th>
                          <th>Description</th>
                          <th className="w-24">Part No.</th>
                          <th className="w-24">Steel</th>
                          <th className="w-20">Thk.</th>
                          {PROD_STAGES.map(s => <th key={s.key} className="w-32 text-center">{s.label}</th>)}
                          {canManageLists && <th className="w-16"><span className="sr-only">إجراءات</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {scopedProd.map((it: any) => {
                          const needsPaint = it.required_painting !== "NA";
                          return (
                            <tr key={it.id}>
                              <td className="text-center tabular-nums">{it.qty}</td>
                              <td className="text-text">{it.description}</td>
                              <td className="font-mono text-accent">{it.part_no ?? "—"}</td>
                              <td className="text-subtext">{it.sheet_steel ?? "—"}</td>
                              <td className="text-subtext">{it.thickness ?? "—"}</td>
                              {PROD_STAGES.map(s => {
                                if (s.key === "paint" && !needsPaint) {
                                  return <td key={s.key} className="text-center text-[11px] font-medium text-subtext">NA</td>;
                                }
                                const produced = it[s.col] ?? 0;
                                const remaining = (it.qty ?? 0) - produced;
                                let prevKey: StageKey | null = null;
                                if (s.key === "paint") prevKey = "sheet";
                                if (s.key === "assembly") prevKey = needsPaint ? "paint" : "sheet";
                                const prevCol = prevKey ? `qty_${prevKey}` : null;
                                const available = prevCol ? (it[prevCol] ?? 0) - produced : Infinity;
                                const canLog = remaining > 0 && available > 0;
                                const prevLabel = PROD_STAGES.find(x => x.key === prevKey)?.label;
                                return (
                                  <td key={s.key}>
                                    <div className="flex items-center justify-center gap-1.5">
                                      <span className={cn("tabular-nums", remaining <= 0 ? "font-semibold text-success" : "text-text")}>
                                        {fmt(produced)}/{fmt(it.qty)}
                                      </span>
                                      <button type="button" onClick={() => openLogStage(it, s.key)} disabled={!canLog || !isManager}
                                        title={isManager ? undefined : "للمدير بس"}
                                        className="eg-btn-subtle eg-btn-xs text-accent hover:bg-accent/10 hover:text-accent disabled:text-muted disabled:hover:bg-transparent">
                                        تسجيل
                                      </button>
                                    </div>
                                    {!canLog && remaining > 0 && prevLabel && (
                                      <p className="mt-0.5 text-center text-[11px] leading-4 text-warning">بانتظار {prevLabel}</p>
                                    )}
                                  </td>
                                );
                              })}
                              {canManageLists && (
                                <td>
                                  <div className="flex items-center gap-1">
                                    <Tooltip content="تعديل">
                                      <button type="button" onClick={() => openEditProdItem(it)} className="eg-icon-btn" aria-label="تعديل الصف">
                                        <Pencil className="size-3.5" />
                                      </button>
                                    </Tooltip>
                                    <Tooltip content="حذف">
                                      <button type="button" onClick={() => removeProdItem(it.id)} className="eg-icon-btn-danger" aria-label="حذف الصف">
                                        <Trash2 className="size-3.5" />
                                      </button>
                                    </Tooltip>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="eg-card"><EmptyState message="لا توجد بنود إنتاج بعد" icon={Factory} /></div>
              )}

              {canAddChildren && (
                <section className="eg-card space-y-3">
                  <SectionHeader
                    title="إضافة بنود"
                    icon={Plus}
                    description="الصق من Excel في أي خانة (Qty, Description, Part No., Steel, Thickness)"
                  />
                  <GridEditor
                    cols={[
                      { key: "qty", label: "Qty", w: "w-16" },
                      { key: "description", label: "Description", w: "" },
                      { key: "part_no", label: "Part No.", w: "w-28" },
                      { key: "sheet_steel", label: "Steel", w: "w-28" },
                      { key: "thickness", label: "Thk.", w: "w-24" },
                    ]}
                    rows={draftRows as any[]}
                    onChange={(idx, patch) => updateProdDraft(idx, patch as Partial<ProdDraft>)}
                    onPaste={handleProdPaste}
                    onRemove={removeProdDraft}
                    extra={(row, idx) => (
                      <select value={row.required_painting}
                        onChange={e => updateProdDraft(idx, { required_painting: e.target.value as "YES" | "NA" })}
                        aria-label={`الدهان — صف ${idx + 1}`}
                        className="eg-select eg-input-sm">
                        <option value="YES">يدخل دهان</option>
                        <option value="NA">بدون دهان</option>
                      </select>
                    )}
                    extraHead="الدهان"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={() => setDraftRows(p => [...p, emptyProdDraft()])} className="eg-btn-ghost eg-btn-sm">
                      <Plus className="size-3.5" />صف
                    </button>
                    <button type="button" onClick={saveProdList} disabled={savingProdList} className="eg-btn-success eg-btn-sm">
                      {savingProdList ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
                      {savingProdList ? "جاري الحفظ..." : "حفظ البنود"}
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ═══ BOM ═══ */}
          {tab === "bom" && (
            <div className="space-y-4">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtext">
                {activeItemNote}
                <span>
                  {bomDeptEffective
                    ? <>بنود الـ BOM لقسم <span className="font-medium text-text">{deptLabel(bomDeptEffective)}</span>.</>
                    : <span className="text-warning">اختار القسم اللي البنود دي بتاعته قبل الحفظ.</span>}
                </span>
              </p>

              {dnSelectedRows.length > 0 && (
                <div className="eg-card flex animate-fade-in flex-wrap items-center justify-between gap-3 !p-3">
                  <span className="flex items-center gap-2 text-xs text-text">
                    <span className="grid size-6 place-items-center rounded-full bg-accent/15 text-[11px] font-semibold tabular-nums text-accent">
                      {dnSelectedRows.length}
                    </span>
                    متحدد {dnSelectedRows.length} بند للصرف
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setDnSel({})} className="eg-btn-ghost eg-btn-sm">إلغاء التحديد</button>
                    <button type="button" onClick={() => setDnOpen(true)} className="eg-btn-success eg-btn-sm">
                      <Printer className="size-3.5" />صرف وطباعة الإذن
                    </button>
                  </div>
                </div>
              )}
              {scopedBom.length > 0 ? (
                <div className="eg-card overflow-hidden !p-0">
                  <div className="overflow-x-auto">
                    <table className="eg-table eg-table-compact min-w-[860px]">
                      <thead>
                        <tr>
                          <th className="w-10"><span className="sr-only">تحديد</span></th>
                          <th className="w-14 text-center">S.NO</th>
                          <th className="w-16 text-center">Qty</th>
                          <th className="w-16 text-center">Unit</th>
                          <th>Description</th>
                          <th className="w-24">Part No.</th>
                          <th className="w-28">Remark</th>
                          <th className="w-20 text-center">القسم</th>
                          <th className="w-20 text-center">المنصرف</th>
                          <th className="w-20 text-center">المتبقي</th>
                          <th className="w-36 text-center">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scopedBom.map((it: any) => {
                          const remaining = (it.qty ?? 0) - (it.qty_dispensed ?? 0);
                          const selected = dnSel[it.id] !== undefined;
                          return (
                            <tr key={it.id} className={cn(selected && "bg-accent/[0.06]")}>
                              <td className="text-center">
                                {canDispense(it) && remaining > 0 && (
                                  <input type="checkbox" checked={selected} onChange={() => toggleDnSel(it)}
                                    aria-label={`تحديد ${it.description} للصرف`} className="align-middle" />
                                )}
                              </td>
                              <td className="text-center tabular-nums text-subtext">{it.s_no ?? "—"}</td>
                              <td className="text-center tabular-nums">{it.qty}</td>
                              <td className="text-center text-subtext">{it.unit ?? "—"}</td>
                              <td className="text-text">{it.description}</td>
                              <td className="font-mono text-accent">{it.part_no ?? "—"}</td>
                              <td className="text-subtext">{it.remark ?? "—"}</td>
                              <td className="text-center">
                                {it.department
                                  ? <Badge label={deptLabel(it.department)} tone="neutral" dot={false} />
                                  : <span className="text-muted">—</span>}
                              </td>
                              <td className="text-center font-medium tabular-nums">{it.qty_dispensed ?? 0}</td>
                              <td className={cn("text-center font-semibold tabular-nums", remaining <= 0 ? "text-success" : "text-warning")}>{remaining}</td>
                              <td>
                                <div className="flex items-center justify-center gap-1">
                                  <button type="button" onClick={() => openDispenseFor(it)} disabled={remaining <= 0 || !canDispense(it)}
                                    className="eg-btn-subtle eg-btn-xs text-success hover:bg-success/10 hover:text-success disabled:text-muted disabled:hover:bg-transparent">
                                    صرف
                                  </button>
                                  {canManageLists && (
                                    <>
                                      <Tooltip content="تعديل">
                                        <button type="button" onClick={() => openEditBomItem(it)} className="eg-icon-btn" aria-label="تعديل البند">
                                          <Pencil className="size-3.5" />
                                        </button>
                                      </Tooltip>
                                      <Tooltip content="حذف">
                                        <button type="button" onClick={() => removeBomItem(it.id)} className="eg-icon-btn-danger" aria-label="حذف البند">
                                          <Trash2 className="size-3.5" />
                                        </button>
                                      </Tooltip>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="eg-card"><EmptyState message="لا توجد بنود BOM لقسمك على هذا الأمر" icon={Boxes} /></div>
              )}

              {canAddChildren && (
                <section className="eg-card space-y-3">
                  <SectionHeader
                    title="إضافة بنود BOM"
                    icon={Plus}
                    description="الصق من Excel (S.NO, Qty, Unit, Description, Part No., Remark) — القسم تلقائي"
                  />
                  <GridEditor
                    cols={[
                      { key: "s_no", label: "S.NO", w: "w-16" },
                      { key: "qty", label: "Qty", w: "w-16" },
                      { key: "unit", label: "Unit", w: "w-16" },
                      { key: "description", label: "Description", w: "" },
                      { key: "part_no", label: "Part No.", w: "w-28" },
                      { key: "remark", label: "Remark", w: "w-32" },
                    ]}
                    rows={bomDraftRows as any[]}
                    onChange={(idx, patch) => updateBomDraft(idx, patch as Partial<BomDraft>)}
                    onPaste={handleBomPaste}
                    onRemove={removeBomDraft}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={() => setBomDraftRows(p => [...p, emptyBomDraft()])} className="eg-btn-ghost eg-btn-sm">
                      <Plus className="size-3.5" />صف
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      {(isManager || isDesign) && (
                        <select value={bomDept} onChange={e => setBomDept(e.target.value)} aria-label="القسم" className="eg-select eg-input-sm w-40">
                          <option value="">— اختار القسم —</option>
                          {["SHEET", "PAINT", "ELEC_ASSEMBLY", "MECH_ASSEMBLY"].map(d => <option key={d} value={d}>{deptLabel(d)}</option>)}
                        </select>
                      )}
                      <button type="button" onClick={saveBomList} disabled={savingBomList || !bomDeptEffective} className="eg-btn-success eg-btn-sm">
                        {savingBomList ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
                        {savingBomList ? "جاري الحفظ..." : "حفظ البنود"}
                      </button>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </section>
      </PageBody>

      {/* ═══ مودال تعديل صف الإنتاج ═══ */}
      <Modal open={!!editProdItem} onClose={() => setEditProdItem(null)} title="تعديل صف قائمة الإنتاج"
        description={editProdItem?.description || undefined}>
        <form onSubmit={e => { e.preventDefault(); submitEditProdItem(); }} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Qty">
              <input type="number" min="0.01" step="any" value={editProdForm.qty} autoFocus
                onChange={e => setEditProdForm(f => ({ ...f, qty: e.target.value }))} className="eg-input" />
            </Field>
            <Field label="Part No.">
              <input value={editProdForm.part_no}
                onChange={e => setEditProdForm(f => ({ ...f, part_no: e.target.value }))} className="eg-input font-mono" />
            </Field>
          </div>
          <Field label="Description">
            <input value={editProdForm.description}
              onChange={e => setEditProdForm(f => ({ ...f, description: e.target.value }))} className="eg-input" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Steel">
              <input value={editProdForm.sheet_steel}
                onChange={e => setEditProdForm(f => ({ ...f, sheet_steel: e.target.value }))} className="eg-input" />
            </Field>
            <Field label="Thickness">
              <input value={editProdForm.thickness}
                onChange={e => setEditProdForm(f => ({ ...f, thickness: e.target.value }))} className="eg-input" />
            </Field>
          </div>
          <Field label="الدهان">
            <select value={editProdForm.required_painting}
              onChange={e => setEditProdForm(f => ({ ...f, required_painting: e.target.value as "YES" | "NA" }))}
              className="eg-select">
              <option value="YES">يدخل دهان</option>
              <option value="NA">بدون دهان</option>
            </select>
          </Field>
          <button type="submit" disabled={savingEditProd} className="eg-btn-success w-full">
            {savingEditProd ? <Spinner /> : <Save className="size-4" />}
            {savingEditProd ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </form>
      </Modal>

      {/* ═══ مودال تعديل BOM ═══ */}
      <Modal open={!!editBomItem} onClose={() => setEditBomItem(null)} title="تعديل بند BOM"
        description={editBomItem?.description || undefined}>
        <form onSubmit={e => { e.preventDefault(); submitEditBomItem(); }} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="S.NO">
              <input type="number" value={editBomForm.s_no} autoFocus
                onChange={e => setEditBomForm(f => ({ ...f, s_no: e.target.value }))} className="eg-input" />
            </Field>
            <Field label="Qty">
              <input type="number" min="0.01" step="any" value={editBomForm.qty}
                onChange={e => setEditBomForm(f => ({ ...f, qty: e.target.value }))} className="eg-input" />
            </Field>
            <Field label="Unit">
              <input value={editBomForm.unit}
                onChange={e => setEditBomForm(f => ({ ...f, unit: e.target.value }))} className="eg-input" />
            </Field>
            <Field label="Part No.">
              <input value={editBomForm.part_no}
                onChange={e => setEditBomForm(f => ({ ...f, part_no: e.target.value }))} className="eg-input font-mono" />
            </Field>
          </div>
          <Field label="Description">
            <input value={editBomForm.description}
              onChange={e => setEditBomForm(f => ({ ...f, description: e.target.value }))} className="eg-input" />
          </Field>
          <Field label="Remark">
            <input value={editBomForm.remark}
              onChange={e => setEditBomForm(f => ({ ...f, remark: e.target.value }))} className="eg-input" />
          </Field>
          <button type="submit" disabled={savingEditBom} className="eg-btn-success w-full">
            {savingEditBom ? <Spinner /> : <Save className="size-4" />}
            {savingEditBom ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </form>
      </Modal>

      {/* ═══ تنبيه: الحالة مكتملة والأقسام مش كلها مكتملة ═══ */}
      <Modal open={!!statusConfirm} onClose={() => setStatusConfirm(null)} title="أقسام لسه مش مكتملة" size="sm">
        {statusConfirm && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning/10 text-warning">
                <AlertTriangle className="size-5" />
              </span>
              <p className="pt-1 text-sm leading-6 text-subtext">
                لو حددت الأمر &quot;مكتمل&quot; دلوقتي، الأقسام دي لسه ماخلصتش:
              </p>
            </div>
            <ul className="space-y-1.5 rounded-lg border border-warning/20 bg-warning/[0.06] p-3">
              {statusConfirm.incomplete.map(d => (
                <li key={d} className="flex items-center gap-2 text-sm text-warning">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
                  {deptLabel(d)}
                </li>
              ))}
            </ul>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={() => setStatusConfirm(null)} className="eg-btn-ghost w-full sm:flex-1">تراجع</button>
              <button type="button" onClick={() => changeStatus(statusConfirm.next, true)} disabled={saving} className="eg-btn-success w-full sm:flex-1">
                {saving && <Spinner />}
                تأكيد على أي حال
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ مودال إذن صرف مواد ═══ */}
      {/* مش form عن قصد: Enter في خانة كمية مايصرفش البنود قبل ما المستخدم يراجعها */}
      <Modal open={dnOpen} onClose={() => setDnOpen(false)} title="إذن صرف مواد" size="md"
        description={<>أمر <span className="font-mono">{wo.wo_number}</span> · <span className="tabular-nums">{dnSelectedRows.length}</span> بند</>}>
        <div className="space-y-4">
          {dnSelectedRows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <table className="eg-table eg-table-compact">
                <thead>
                  <tr>
                    <th>البند</th>
                    <th className="w-20 text-center">المتبقي</th>
                    <th className="w-28 text-center">المنصرف</th>
                    <th className="w-10"><span className="sr-only">إزالة</span></th>
                  </tr>
                </thead>
                <tbody>
                  {dnSelectedRows.map(it => {
                    const rem = (it.qty ?? 0) - (it.qty_dispensed ?? 0);
                    return (
                      <tr key={it.id}>
                        <td className="text-text">{it.description}</td>
                        <td className="text-center tabular-nums text-subtext">{rem} {it.unit ?? ""}</td>
                        <td>
                          <input type="number" min="0.01" step="any" max={rem} value={dnSel[it.id]}
                            onChange={e => setDnSel(prev => ({ ...prev, [it.id]: e.target.value }))}
                            aria-label={`الكمية المنصرفة: ${it.description}`}
                            className="eg-input eg-input-sm" />
                          {parseFloat(dnSel[it.id]) > 0 && (
                            <p className="mt-0.5 text-[11px] leading-4 text-subtext">{quantityToArabicWords(parseFloat(dnSel[it.id]), it.unit)}</p>
                          )}
                        </td>
                        <td className="text-center">
                          <Tooltip content="إزالة">
                            <button type="button" onClick={() => toggleDnSel(it)} className="eg-icon-btn-danger" aria-label="إزالة من الإذن">
                              <X className="size-3.5" />
                            </button>
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState compact icon={Boxes} message="مفيش بنود في الإذن" description="اختار البنود من جدول الـ BOM."
              className="rounded-lg border border-dashed border-border/70" />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="اسم العملية">
              <input value={dnProcess} onChange={e => setDnProcess(e.target.value)} className="eg-input" />
            </Field>
            <Field label="المستلم">
              <input value={dnReceiver} onChange={e => setDnReceiver(e.target.value)} className="eg-input" />
            </Field>
          </div>
          <Field label="المهندس المسؤول">
            <input value={dnEngineer} onChange={e => setDnEngineer(e.target.value)} className="eg-input" />
          </Field>
          <button type="button" onClick={submitDispenseNote} disabled={dnBusy || dnSelectedRows.length === 0}
            className="eg-btn-success w-full">
            {dnBusy ? <Spinner /> : <Printer className="size-4" />}
            {dnBusy ? "جاري الصرف..." : "تأكيد الصرف وتحميل الإذن"}
          </button>
        </div>
      </Modal>

      {/* ═══ مودال تسجيل إنتاج ═══ */}
      <Modal open={!!logStage} onClose={() => setLogStage(null)} title="تسجيل إنتاج" size="sm">
        {logStage && (
          <form onSubmit={e => { e.preventDefault(); submitLogStage(); }} noValidate className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-card2/60 p-3">
              <p className="text-sm font-medium text-text">{logStage.item.description}</p>
              <p className="mt-1 text-[11px] tabular-nums text-subtext">
                المرحلة: {PROD_STAGES.find(s => s.key === logStage.stage)?.label} · المنجز {fmt(logStage.item[`qty_${logStage.stage}`] ?? 0)} / {fmt(logStage.item.qty)}
              </p>
            </div>
            <Field label="الكمية المنجزة" required>
              <input type="number" min="0.01" step="any" value={logQty} autoFocus
                onChange={e => setLogQty(e.target.value)} className="eg-input" />
            </Field>
            <button type="submit" disabled={logging || !(parseFloat(logQty) > 0)} className="eg-btn-success w-full">
              {logging ? <Spinner /> : <Check className="size-4" />}
              {logging ? "جاري التسجيل..." : "تأكيد التسجيل"}
            </button>
          </form>
        )}
      </Modal>
      {/* ═══ حذف أمر الشغل ═══ */}
      <Modal open={delOpen} onClose={closeDelete} size="sm"
        title={<>حذف أمر الشغل <span className="font-mono">{wo.wo_number}</span></>}>
        <form onSubmit={deleteOrder} className="space-y-4" noValidate>
          <div className="flex items-start gap-3 rounded-lg border border-danger/25 bg-danger/[0.06] p-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
            <div className="space-y-1.5 text-xs leading-5 text-subtext">
              <p className="font-semibold text-danger">الحذف نهائي ومش هينفع يترجع.</p>
              <p>هيتحذف الأمر وكل اللي يخصه:</p>
              <ul className="list-inside list-disc space-y-0.5">
                <li><span className="tabular-nums">{items.length}</span> بند</li>
                <li>قائمة الإنتاج (<span className="tabular-nums">{prodItems.length}</span>) وسجلات الإنتاج</li>
                <li>الـ BOM (<span className="tabular-nums">{bomItems.length}</span>) وسجل الصرف وإذون الصرف</li>
                <li>Total BOM (<span className="tabular-nums">{totalBom.length}</span> سطر)</li>
                <li>الملفات (<span className="tabular-nums">{files.length}</span>) والإنتاجية اليومية (<span className="tabular-nums">{productivity.length}</span>)</li>
                <li>طلبات وأوامر الشراء المرتبطة بالأمر</li>
                <li>حالات الأقسام وسجل الحالات</li>
              </ul>
              <p>سجل النشاط بيفضل محتفظ بنسخة من بيانات الأمر.</p>
            </div>
          </div>
          <Field label="كلمة المرور" required hint="اكتب كلمة المرور بتاعتك للتأكيد">
            <input type="password" autoComplete="current-password" value={delPw} autoFocus dir="ltr"
              onChange={e => { setDelPw(e.target.value); setDelError(""); }} className="eg-input" />
          </Field>
          {delError && <p className="eg-error">{delError}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeDelete} disabled={delBusy} className="eg-btn-ghost">إلغاء</button>
            <button type="submit" disabled={delBusy || !delPw} className="eg-btn-danger">
              {delBusy ? <Spinner /> : <KeyRound className="size-4" />}
              {delBusy ? "جاري الحذف..." : "تأكيد الحذف"}
            </button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}

/* ═══════════════════════ مكونات صغيرة ═══════════════════════ */

function DataTable({ head, rows, empty, icon, numeric = [] }: {
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
  icon?: LucideIcon;
  /** أرقام الأعمدة اللي فيها أرقام أو تواريخ (tabular-nums) */
  numeric?: number[];
}) {
  if (!rows.length) return <div className="eg-card"><EmptyState message={empty} icon={icon} /></div>;
  return (
    <div className="eg-card overflow-hidden !p-0">
      <div className="overflow-x-auto">
        <table className="eg-table eg-table-compact min-w-[560px]">
          <thead>
            <tr>{head.map(h => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} className={cn(j === 0 ? "text-text" : "text-subtext", numeric.includes(j) && "tabular-nums")}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* محرر شبكي بيدعم اللصق من Excel */
function GridEditor({
  cols, rows, onChange, onPaste, onRemove, extra, extraHead,
}: {
  cols: { key: string; label: string; w: string }[];
  rows: any[];
  onChange: (idx: number, patch: Record<string, string>) => void;
  onPaste: (e: ClipboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) => void;
  onRemove: (idx: number) => void;
  extra?: (row: any, idx: number) => React.ReactNode;
  extraHead?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/70">
      <table className="eg-table eg-table-compact min-w-[600px]">
        <thead>
          <tr>
            {cols.map(c => <th key={c.key} className={c.w}>{c.label}</th>)}
            {extra && <th className="w-36">{extraHead}</th>}
            <th className="w-10"><span className="sr-only">حذف الصف</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rIdx) => (
            <tr key={rIdx}>
              {cols.map((c, cIdx) => (
                <td key={c.key} className="px-1.5 py-1">
                  <input value={row[c.key] ?? ""}
                    onChange={e => onChange(rIdx, { [c.key]: e.target.value })}
                    onPaste={e => onPaste(e, rIdx, cIdx)}
                    aria-label={`${c.label} — صف ${rIdx + 1}`}
                    className="eg-input eg-input-sm" />
                </td>
              ))}
              {extra && <td className="px-1.5 py-1">{extra(row, rIdx)}</td>}
              <td className="px-1.5 py-1 text-center">
                <Tooltip content="حذف الصف">
                  <button type="button" onClick={() => onRemove(rIdx)} className="eg-icon-btn-danger" aria-label={`حذف الصف ${rIdx + 1}`}>
                    <X className="size-3.5" />
                  </button>
                </Tooltip>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
