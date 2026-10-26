// تسميات الأدوار والأقسام بالعربي للعرض في الـ UI

export const ROLE_LABEL: Record<string, string> = {
  admin: "مدير النظام",
  manager: "مدير المصنع",
  secretary: "سكرتارية",
};

export const DEPT_LABEL: Record<string, string> = {
  SHEET: "قسم الصاج",
  PAINT: "قسم الدهان",
  // "assembly" في الداتابيز اسم قديم لقسم التجميع الميكانيكي (009_departments_aliases)
  ASSEMBLY: "التجميع الميكانيكي",
  ELEC_ASSEMBLY: "التجميع الكهربي",
  MECH_ASSEMBLY: "التجميع الميكانيكي",
  DESIGN: "مكتب التصميم",
};

export const roleLabel = (role?: string | null) =>
  (role && ROLE_LABEL[role]) || "مستخدم";

export const deptLabel = (dept?: string | null) =>
  !dept ? "كل الأقسام" : DEPT_LABEL[dept.toUpperCase()] ?? dept;

export const initials = (name?: string | null, email?: string | null) => {
  const src = (name ?? "").trim() || (email ?? "").split("@")[0] || "?";
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
};
