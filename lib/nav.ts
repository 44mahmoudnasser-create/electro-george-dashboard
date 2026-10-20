import {
  LayoutDashboard, Users, Wrench, ClipboardList, FolderOpen, AlertTriangle,
  ShoppingCart, CalendarCheck, BarChart3, Scissors, Paintbrush,
  Hammer, History, type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;     // الاسم الكامل (الـ sidebar)
  short: string;     // الاسم المختصر (الـ bottom nav على الموبايل)
  icon: LucideIcon;
  // السكرتير يشوف الداشبورد والحضور بس. أي دور تاني (admin / manager / غير معروف) يشوف كل حاجة
  // الصفحات نفسها بتتحمي بالصلاحيات، والـ nav بس بيخفي الروابط.
  secretaryVisible?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",     label: "لوحة التحكم",       short: "الرئيسية", icon: LayoutDashboard, secretaryVisible: true },
  { href: "/attendance",    label: "الحضور",            short: "الحضور",   icon: CalendarCheck,   secretaryVisible: true },
  { href: "/technicians",   label: "الفنيين",           short: "الفنيين",  icon: Users },
  { href: "/skills",        label: "المهارات",          short: "المهارات", icon: Wrench },
  { href: "/work-orders",   label: "أوامر الشغل",       short: "أوامر",    icon: ClipboardList },
  { href: "/monitoring/sheet", label: "متابعة الصاج",   short: "الصاج",    icon: Scissors },
  { href: "/monitoring/paint", label: "متابعة الدهان",  short: "الدهان",   icon: Paintbrush },
  { href: "/tools",         label: "الأدوات والعهد",    short: "الأدوات",  icon: Hammer },
  { href: "/productivity",  label: "الإنتاجية",         short: "الإنتاجية", icon: BarChart3 },
  { href: "/files",         label: "الملفات",           short: "الملفات",  icon: FolderOpen },
  { href: "/violations",    label: "المخالفات",         short: "المخالفات", icon: AlertTriangle },
  { href: "/purchases",     label: "طلبات الشراء",      short: "مشتريات",  icon: ShoppingCart },
  { href: "/activity-log",  label: "سجل النشاط",        short: "السجل",    icon: History },
];

export function navForRole(role: string | null | undefined): NavItem[] {
  if (role === "secretary") return NAV_ITEMS.filter(n => n.secretaryVisible);
  return NAV_ITEMS;
}
