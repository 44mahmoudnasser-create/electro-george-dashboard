"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, ClipboardList, CalendarCheck, ShoppingCart, Users } from "lucide-react";

const MOBILE_NAV = [
  { href: "/dashboard",   icon: LayoutDashboard, label: "الرئيسية" },
  { href: "/work-orders", icon: ClipboardList,   label: "أوامر" },
  { href: "/attendance",  icon: CalendarCheck,   label: "الحضور" },
  { href: "/purchases",   icon: ShoppingCart,    label: "مشتريات" },
  { href: "/technicians", icon: Users,           label: "الفنيين" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottomnav fixed bottom-0 inset-x-0 bg-card border-t border-border/50 z-40 px-2 pb-safe">
      <div className="flex justify-around">
        {MOBILE_NAV.map(({ href, icon: Icon, label }) => (
          <Link key={href} href={href}
            className={cn(
              "flex flex-col items-center gap-1 py-2 px-3 text-[10px] transition-colors",
              path.startsWith(href) ? "text-accent" : "text-subtext"
            )}>
            <Icon className={cn("w-5 h-5", path.startsWith(href) && "text-accent")} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
