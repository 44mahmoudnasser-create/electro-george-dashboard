"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Wrench, ClipboardList, FolderOpen,
  AlertTriangle, ShoppingCart, CalendarCheck, BarChart3
} from "lucide-react";

// القائمة كاملة بنفس تابات الويب
const MOBILE_NAV = [
  { href: "/dashboard",    icon: LayoutDashboard, label: "الرئيسية" },
  { href: "/technicians",  icon: Users,           label: "الفنيين" },
  { href: "/skills",       icon: Wrench,          label: "المهارات" },
  { href: "/work-orders",  icon: ClipboardList,   label: "أوامر" },
  { href: "/files",        icon: FolderOpen,      label: "الملفات" },
  { href: "/violations",   icon: AlertTriangle,   label: "المخالفات" },
  { href: "/purchases",    icon: ShoppingCart,    label: "مشتريات" },
  { href: "/attendance",   icon: CalendarCheck,   label: "الحضور" },
  { href: "/productivity", icon: BarChart3,       label: "الإنتاجية" },
];

export default function BottomNav({ role }: { role?: string }) {
  const path = usePathname();

  const visibleNav = role === "secretary"
    ? MOBILE_NAV.filter(n => ["/dashboard", "/attendance"].includes(n.href))
    : MOBILE_NAV;

  return (
    <nav className="bottomnav fixed bottom-0 inset-x-0 bg-card border-t border-border/50 z-40 pb-safe">
      {/* overflow-x-auto يتيح التمرير الأفقي بسلاسة عند زيادة التابات */}
      <div className="flex items-center overflow-x-auto no-scrollbar px-2 py-1 gap-1">
        {visibleNav.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href}
            className={cn(
              "flex flex-col items-center justify-center min-w-[68px] shrink-0 py-1.5 px-2 text-[10px] transition-colors rounded-lg",
              path.startsWith(href) ? "text-accent bg-accent/10 font-bold" : "text-subtext"
            )}>
            <Icon className={cn("w-5 h-5 shrink-0 mb-0.5", path.startsWith(href) && "text-accent")} />
            <span className="truncate max-w-full text-center">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
