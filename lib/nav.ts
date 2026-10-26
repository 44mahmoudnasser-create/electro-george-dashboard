import {
  LayoutDashboard, Users, Wrench, ClipboardList, FolderOpen, AlertTriangle,
  ShoppingCart, CalendarCheck, BarChart3, Scissors, Paintbrush,
  Hammer, History, Cog, type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;     // الاسم الكامل (الـ sidebar)
  short: string;     // الاسم المختصر
  icon: LucideIcon;
  group: NavGroupKey;
  // السكرتير يشوف الداشبورد والحضور بس. أي دور تاني (admin / manager / غير معروف) يشوف كل حاجة
  // الصفحات نفسها بتتحمي بالصلاحيات، والـ nav بس بيخفي الروابط.
  secretaryVisible?: boolean;
};

export type NavGroupKey = "overview" | "production" | "people" | "inventory" | "system";

export const NAV_GROUPS: { key: NavGroupKey; label: string }[] = [
  { key: "overview", label: "نظرة عامة" },
  { key: "production", label: "الإنتاج" },
  { key: "people", label: "العمالة" },
  { key: "inventory", label: "المخزن والمستندات" },
  { key: "system", label: "النظام" },
];

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",     label: "لوحة التحكم",       short: "الرئيسية", icon: LayoutDashboard, group: "overview", secretaryVisible: true },
  { href: "/work-orders",   label: "أوامر الشغل",       short: "أوامر",    icon: ClipboardList,   group: "production" },
  { href: "/monitoring/sheet", label: "متابعة الصاج",   short: "الصاج",    icon: Scissors,        group: "production" },
  { href: "/monitoring/paint", label: "متابعة الدهان",  short: "الدهان",   icon: Paintbrush,      group: "production" },
  { href: "/monitoring/assembly", label: "التجميع الميكانيكي", short: "التجميع", icon: Cog,     group: "production" },
  { href: "/attendance",    label: "الحضور",            short: "الحضور",   icon: CalendarCheck,   group: "people", secretaryVisible: true },
  { href: "/technicians",   label: "الفنيين",           short: "الفنيين",  icon: Users,           group: "people" },
  { href: "/skills",        label: "المهارات",          short: "المهارات", icon: Wrench,          group: "people" },
  { href: "/productivity",  label: "الإنتاجية",         short: "الإنتاجية", icon: BarChart3,      group: "people" },
  { href: "/violations",    label: "المخالفات",         short: "المخالفات", icon: AlertTriangle,  group: "people" },
  { href: "/tools",         label: "الأدوات والعهد",    short: "الأدوات",  icon: Hammer,          group: "inventory" },
  { href: "/purchases",     label: "طلبات الشراء",      short: "مشتريات",  icon: ShoppingCart,    group: "inventory" },
  { href: "/files",         label: "الملفات",           short: "الملفات",  icon: FolderOpen,      group: "inventory" },
  { href: "/activity-log",  label: "سجل النشاط",        short: "السجل",    icon: History,         group: "system" },
];

export function navForRole(role: string | null | undefined): NavItem[] {
  if (role === "secretary") return NAV_ITEMS.filter(n => n.secretaryVisible);
  return NAV_ITEMS;
}

// الروابط مقسمة على مجموعات (المجموعات الفاضية بتتشال)
export function navGroupsForRole(role: string | null | undefined) {
  const items = navForRole(role);
  return NAV_GROUPS
    .map(g => ({ ...g, items: items.filter(i => i.group === g.key) }))
    .filter(g => g.items.length > 0);
}

export const isActivePath = (path: string, href: string) => path === href || path.startsWith(href + "/");
