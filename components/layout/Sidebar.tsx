"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Wrench, ClipboardList, FolderOpen,
  AlertTriangle, ShoppingCart, CalendarCheck, BarChart3, LogOut
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const NAV = [
  { href: "/dashboard",   icon: LayoutDashboard, label: "لوحة التحكم" },
  { href: "/technicians", icon: Users,            label: "الفنيين" },
  { href: "/skills",      icon: Wrench,           label: "المهارات" },
  { href: "/work-orders", icon: ClipboardList,    label: "أوامر الشغل" },
  { href: "/files",       icon: FolderOpen,       label: "الملفات" },
  { href: "/violations",  icon: AlertTriangle,    label: "المخالفات" },
  { href: "/purchases",   icon: ShoppingCart,     label: "طلبات الشراء" },
  { href: "/attendance",  icon: CalendarCheck,    label: "الحضور" },
  { href: "/productivity",icon: BarChart3,         label: "الإنتاجية" },
];

export default function Sidebar({ role }: { role: string }) {
  const path = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Show full nav for admin (or any unknown/missing role — fail open, not closed)
  // Secretary sees only dashboard + attendance
  const visibleNav = role === "secretary"
    ? NAV.filter(n => ["/dashboard", "/attendance"].includes(n.href))
    : NAV; // admin OR fallback → full nav

  return (
    <aside className="sidebar-desktop w-56 min-h-screen bg-card flex flex-col border-l border-border/50">
      {/* Logo */}
      <div className="p-5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center text-white font-bold text-sm">EG</div>
          <div>
            <p className="text-xs font-bold text-accent leading-none">Electro George</p>
            <p className="text-[10px] text-subtext leading-none mt-0.5">قسم التجميع</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {visibleNav.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group",
              path.startsWith(href)
                ? "bg-accent text-white font-semibold"
                : "text-subtext hover:bg-border/50 hover:text-text"
            )}>
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-border/50">
        <button onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-subtext hover:bg-danger/10 hover:text-danger w-full transition-all">
          <LogOut className="w-4 h-4" />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}
