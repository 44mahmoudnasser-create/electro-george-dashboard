"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Pencil, Trash2, ChevronDown } from "lucide-react";

// ---------------------------------------------------------------------
// أنواع البيانات
// ---------------------------------------------------------------------
const BOM_CATEGORIES = ["عدد", "كيلو", "جرام", "علبة"] as const;
type BomCategory = typeof BOM_CATEGORIES[number];

interface ProductionItem {
  id: number;
  standard_product_id: number;
  item_name: string;
  code: string | null;
  finish: string | null;
  quantity: number;
}

interface BomItem {
  id: number;
  standard_product_id: number;
  item_name: string;
  category: BomCategory;
  quantity: number;
}

interface StandardProduct {
  id: number;
  name: string;
  created_at: string;
  production_items: ProductionItem[];
  bom_items: BomItem[];
}

type ProductionForm = { item_name: string; code: string; finish: string; quantity: string };
const emptyProductionForm = (): ProductionForm => ({ item_name: "", code: "", finish: "", quantity: "1" });

type BomForm = { item_name: string; category: BomCategory; quantity: string };
const emptyBomForm = (): BomForm => ({ item_name: "", category: "عدد", quantity: "1" });

export default function StandardClient({
  initialProducts, role,
}: { initialProducts: StandardProduct[]; role: string }) {
  const [products, setProducts] = useState<StandardProduct[]>(initialProducts);
  const isAdmin = role === "admin";
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Record<number, "production" | "bom">>({});

  // ---------- مودال: منتج قياسي جديد ----------
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");

  // ---------- مودال: تعديل اسم المنتج ----------
  const [editProduct, setEditProduct] = useState<StandardProduct | null>(null);
  const [editProductName, setEditProductName] = useState("");

  // ---------- مودال: إضافة/تعديل صف في قائمة الإنتاج ----------
  const [productionModal, setProductionModal] = useState<{ productId: number; item?: ProductionItem } | null>(null);
  const [productionForm, setProductionForm] = useState<ProductionForm>(emptyProductionForm());

  // ---------- مودال: إضافة/تعديل صف BOM ----------
  const [bomModal, setBomModal] = useState<{ productId: number; item?: BomItem } | null>(null);
  const [bomForm, setBomForm] = useState<BomForm>(emptyBomForm());

  const getTab = (productId: number) => activeTab[productId] ?? "production";
  const setTab = (productId: number, tab: "production" | "bom") =>
    setActiveTab(prev => ({ ...prev, [productId]: tab }));

  // ---------------------------------------------------------------------
  // منتج قياسي: إنشاء / تعديل / حذف
  // ---------------------------------------------------------------------
  const createProduct = async () => {
    if (!newProductName.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from("standard_products")
      .insert({ name: newProductName.trim() }).select("*").single();
    if (error) { alert(error.message); setSaving(false); return; }
    setProducts(prev => [{ ...data, production_items: [], bom_items: [] }, ...prev]);
    setAddProductOpen(false); setNewProductName(""); setSaving(false);
  };

  const openEditProduct = (p: StandardProduct) => { setEditProduct(p); setEditProductName(p.name); };

  const submitEditProduct = async () => {
    if (!editProduct || !editProductName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("standard_products")
      .update({ name: editProductName.trim() }).eq("id", editProduct.id);
    if (error) { alert(error.message); setSaving(false); return; }
    setProducts(prev => prev.map(p => p.id === editProduct.id ? { ...p, name: editProductName.trim() } : p));
    setEditProduct(null); setSaving(false);
  };

  const removeProduct = async (productId: number) => {
    if (!confirm("حذف هذا المنتج بكل قائمة إنتاجه وBOM بتاعه؟")) return;
    await supabase.from("standard_products").delete().eq("id", productId);
    setProducts(prev => prev.filter(p => p.id !== productId));
  };

  // ---------------------------------------------------------------------
  // قائمة الإنتاج: إضافة / تعديل / حذف صف
  // ---------------------------------------------------------------------
  const openAddProduction = (productId: number) => {
    setProductionModal({ productId }); setProductionForm(emptyProductionForm());
  };
  const openEditProduction = (productId: number, item: ProductionItem) => {
    setProductionModal({ productId, item });
    setProductionForm({ item_name: item.item_name, code: item.code ?? "", finish: item.finish ?? "", quantity: String(item.quantity) });
  };

  const submitProduction = async () => {
    if (!productionModal || !productionForm.item_name.trim()) return;
    setSaving(true);
    const payload = {
      item_name: productionForm.item_name,
      code: productionForm.code || null,
      finish: productionForm.finish || null,
      quantity: parseFloat(productionForm.quantity) || 1,
    };
    if (productionModal.item) {
      const { error } = await supabase.from("production_items").update(payload).eq("id", productionModal.item.id);
      if (error) { alert(error.message); setSaving(false); return; }
      setProducts(prev => prev.map(p => p.id === productionModal.productId
        ? { ...p, production_items: p.production_items.map(it => it.id === productionModal.item!.id ? { ...it, ...payload } : it) }
        : p));
    } else {
      const { data, error } = await supabase.from("production_items")
        .insert({ ...payload, standard_product_id: productionModal.productId }).select("*").single();
      if (error) { alert(error.message); setSaving(false); return; }
      setProducts(prev => prev.map(p => p.id === productionModal.productId
        ? { ...p, production_items: [...p.production_items, data] } : p));
    }
    setProductionModal(null); setSaving(false);
  };

  const removeProduction = async (productId: number, itemId: number) => {
    if (!confirm("حذف هذا الصف من قائمة الإنتاج؟")) return;
    await supabase.from("production_items").delete().eq("id", itemId);
    setProducts(prev => prev.map(p => p.id === productId
      ? { ...p, production_items: p.production_items.filter(it => it.id !== itemId) } : p));
  };

  // ---------------------------------------------------------------------
  // BOM: إضافة / تعديل / حذف صف
  // ---------------------------------------------------------------------
  const openAddBom = (productId: number) => { setBomModal({ productId }); setBomForm(emptyBomForm()); };
  const openEditBom = (productId: number, item: BomItem) => {
    setBomModal({ productId, item });
    setBomForm({ item_name: item.item_name, category: item.category, quantity: String(item.quantity) });
  };

  const submitBom = async () => {
    if (!bomModal || !bomForm.item_name.trim()) return;
    setSaving(true);
    const payload = {
      item_name: bomForm.item_name,
      category: bomForm.category,
      quantity: parseFloat(bomForm.quantity) || 1,
    };
    if (bomModal.item) {
      const { error } = await supabase.from("bom_items").update(payload).eq("id", bomModal.item.id);
      if (error) { alert(error.message); setSaving(false); return; }
      setProducts(prev => prev.map(p => p.id === bomModal.productId
        ? { ...p, bom_items: p.bom_items.map(it => it.id === bomModal.item!.id ? { ...it, ...payload } : it) }
        : p));
    } else {
      const { data, error } = await supabase.from("bom_items")
        .insert({ ...payload, standard_product_id: bomModal.productId }).select("*").single();
      if (error) { alert(error.message); setSaving(false); return; }
      setProducts(prev => prev.map(p => p.id === bomModal.productId
        ? { ...p, bom_items: [...p.bom_items, data] } : p));
    }
    setBomModal(null); setSaving(false);
  };

  const removeBom = async (productId: number, itemId: number) => {
    if (!confirm("حذف هذا الصف من الـ BOM؟")) return;
    await supabase.from("bom_items").delete().eq("id", itemId);
    setProducts(prev => prev.map(p => p.id === productId
      ? { ...p, bom_items: p.bom_items.filter(it => it.id !== itemId) } : p));
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">📦 المنتجات القياسية</h1>
          <p className="text-sm text-subtext mt-0.5">تسجيل المنتجات القياسية بقائمة إنتاجها وBOM بتاعها</p>
        </div>
        <button onClick={() => setAddProductOpen(true)} className="eg-btn-primary">
          <Plus className="w-4 h-4" />منتج قياسي جديد
        </button>
      </div>

      <div className="space-y-4">
        {products.map(product => {
          const tab = getTab(product.id);
          return (
            <details key={product.id} open className="eg-card overflow-hidden group">
              <summary className="flex items-center justify-between gap-3 p-3 cursor-pointer select-none list-none flex-wrap">
                <div className="flex items-center gap-3">
                  <ChevronDown className="w-4 h-4 text-subtext transition-transform group-open:rotate-180" />
                  <span className="font-bold text-text">{product.name}</span>
                  <span className="text-subtext text-xs">
                    · {product.production_items.length} صنف بقائمة الإنتاج · {product.bom_items.length} بند BOM
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-3">
                    <button onClick={(e) => { e.preventDefault(); openEditProduct(product); }}
                      className="text-accent hover:text-accent2 transition-colors">
                      <Pencil className="w-4 h-4" /></button>
                    <button onClick={(e) => { e.preventDefault(); removeProduct(product.id); }}
                      className="text-danger/60 hover:text-danger transition-colors">
                      <Trash2 className="w-4 h-4" /></button>
                  </div>
                )}
              </summary>

              <div className="border-t border-border">
                {/* Tabs */}
                <div className="flex gap-1 px-3 pt-3">
                  <button onClick={() => setTab(product.id, "production")}
                    className={`text-sm px-3 py-1.5 rounded-t-lg font-medium transition-colors ${
                      tab === "production" ? "bg-card2 text-accent" : "text-subtext hover:text-text"}`}>
                    قائمة الإنتاج
                  </button>
                  <button onClick={() => setTab(product.id, "bom")}
                    className={`text-sm px-3 py-1.5 rounded-t-lg font-medium transition-colors ${
                      tab === "bom" ? "bg-card2 text-accent" : "text-subtext hover:text-text"}`}>
                    BOM (الخامات)
                  </button>
                </div>

                {tab === "production" ? (
                  <div className="overflow-x-auto">
                    <div className="flex justify-end px-3 pt-2">
                      <button onClick={() => openAddProduction(product.id)}
                        className="text-accent text-xs hover:underline flex items-center gap-1">
                        <Plus className="w-3 h-3" />إضافة صنف
                      </button>
                    </div>
                    <table className="eg-table">
                      <thead><tr>
                        <th>الصنف</th><th>الكود</th><th>الفينيش</th><th>العدد</th>
                        {isAdmin && <th>إجراءات</th>}
                      </tr></thead>
                      <tbody>
                        {product.production_items.map(item => (
                          <tr key={item.id}>
                            <td className="font-medium text-text">{item.item_name}</td>
                            <td className="font-mono text-accent">{item.code ?? "—"}</td>
                            <td>{item.finish ?? "—"}</td>
                            <td>{item.quantity}</td>
                            {isAdmin && (
                              <td>
                                <div className="flex gap-2">
                                  <button onClick={() => openEditProduction(product.id, item)} className="text-accent hover:text-accent2 transition-colors">
                                    <Pencil className="w-4 h-4" /></button>
                                  <button onClick={() => removeProduction(product.id, item.id)} className="text-danger/60 hover:text-danger transition-colors">
                                    <Trash2 className="w-4 h-4" /></button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                        {product.production_items.length === 0 && (
                          <tr><td colSpan={isAdmin ? 5 : 4} className="text-center text-subtext text-sm py-3">لا توجد أصناف بعد</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="flex justify-end px-3 pt-2">
                      <button onClick={() => openAddBom(product.id)}
                        className="text-accent text-xs hover:underline flex items-center gap-1">
                        <Plus className="w-3 h-3" />إضافة بند
                      </button>
                    </div>
                    <table className="eg-table">
                      <thead><tr>
                        <th>الخامة</th><th>الفئة</th><th>الكمية</th>
                        {isAdmin && <th>إجراءات</th>}
                      </tr></thead>
                      <tbody>
                        {product.bom_items.map(item => (
                          <tr key={item.id}>
                            <td className="font-medium text-text">{item.item_name}</td>
                            <td>{item.category}</td>
                            <td>{item.quantity}</td>
                            {isAdmin && (
                              <td>
                                <div className="flex gap-2">
                                  <button onClick={() => openEditBom(product.id, item)} className="text-accent hover:text-accent2 transition-colors">
                                    <Pencil className="w-4 h-4" /></button>
                                  <button onClick={() => removeBom(product.id, item.id)} className="text-danger/60 hover:text-danger transition-colors">
                                    <Trash2 className="w-4 h-4" /></button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                        {product.bom_items.length === 0 && (
                          <tr><td colSpan={isAdmin ? 4 : 3} className="text-center text-subtext text-sm py-3">لا توجد خامات بعد</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </details>
          );
        })}
        {products.length === 0 && <div className="eg-card"><EmptyState /></div>}
      </div>

      {/* منتج قياسي جديد */}
      <Modal open={addProductOpen} onClose={() => { setAddProductOpen(false); setNewProductName(""); }} title="منتج قياسي جديد">
        <div className="space-y-4">
          <div><label className="eg-label">اسم المنتج *</label>
            <input value={newProductName} onChange={e => setNewProductName(e.target.value)} className="eg-input"
              placeholder="مثال: شباك سحاب ألوميتال" /></div>
          <p className="text-xs text-subtext">تقدر تضيف أصناف قائمة الإنتاج وبنود الـ BOM بعد ما تحفظ المنتج.</p>
        </div>
        <button onClick={createProduct} disabled={saving} className="eg-btn-primary w-full justify-center mt-5">
          {saving ? "جاري الحفظ..." : "💾 حفظ المنتج"}
        </button>
      </Modal>

      {/* تعديل اسم المنتج */}
      <Modal open={!!editProduct} onClose={() => setEditProduct(null)} title="تعديل المنتج">
        <div><label className="eg-label">اسم المنتج *</label>
          <input value={editProductName} onChange={e => setEditProductName(e.target.value)} className="eg-input" /></div>
        <button onClick={submitEditProduct} disabled={saving} className="eg-btn-success w-full justify-center mt-5">
          {saving ? "جاري الحفظ..." : "💾 حفظ التعديل"}
        </button>
      </Modal>

      {/* إضافة/تعديل صف في قائمة الإنتاج */}
      <Modal open={!!productionModal} onClose={() => setProductionModal(null)}
        title={productionModal?.item ? "تعديل الصنف" : "إضافة صنف لقائمة الإنتاج"}>
        <div className="space-y-4">
          <div><label className="eg-label">اسم الصنف *</label>
            <input value={productionForm.item_name} onChange={e => setProductionForm(f => ({ ...f, item_name: e.target.value }))} className="eg-input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="eg-label">الكود</label>
              <input value={productionForm.code} onChange={e => setProductionForm(f => ({ ...f, code: e.target.value }))} className="eg-input" /></div>
            <div><label className="eg-label">الفينيش</label>
              <input value={productionForm.finish} onChange={e => setProductionForm(f => ({ ...f, finish: e.target.value }))} className="eg-input" /></div>
          </div>
          <div><label className="eg-label">العدد</label>
            <input type="number" min="0.01" step="any" value={productionForm.quantity}
              onChange={e => setProductionForm(f => ({ ...f, quantity: e.target.value }))} className="eg-input" /></div>
        </div>
        <button onClick={submitProduction} disabled={saving} className="eg-btn-primary w-full justify-center mt-5">
          {saving ? "جاري الحفظ..." : "💾 حفظ"}
        </button>
      </Modal>

      {/* إضافة/تعديل صف BOM */}
      <Modal open={!!bomModal} onClose={() => setBomModal(null)} title={bomModal?.item ? "تعديل بند الـ BOM" : "إضافة بند للـ BOM"}>
        <div className="space-y-4">
          <div><label className="eg-label">اسم الخامة *</label>
            <input value={bomForm.item_name} onChange={e => setBomForm(f => ({ ...f, item_name: e.target.value }))} className="eg-input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="eg-label">الكمية</label>
              <input type="number" min="0.01" step="any" value={bomForm.quantity}
                onChange={e => setBomForm(f => ({ ...f, quantity: e.target.value }))} className="eg-input" /></div>
            <div><label className="eg-label">الفئة</label>
              <select value={bomForm.category} onChange={e => setBomForm(f => ({ ...f, category: e.target.value as BomCategory }))} className="eg-select">
                {BOM_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select></div>
          </div>
        </div>
        <button onClick={submitBom} disabled={saving} className="eg-btn-primary w-full justify-center mt-5">
          {saving ? "جاري الحفظ..." : "💾 حفظ"}
        </button>
      </Modal>
    </div>
  );
}
