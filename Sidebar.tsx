"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LogOut, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { navForRole } from "@/lib/nav";

export default function Sidebar({
  role, open, onClose,
}: {
  role: string;
  open: boolean;      // بيتحكم فيه الموبايل بس
  onClose: () => void;
}) {
  const path = usePathname();
  const router = useRouter();
  const items = navForRole(role);

  // نقفل الدرج بعد ما يتغير الرابط
  useEffect(() => { onClose(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [path]);

  // Esc يقفل الدرج
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
      {/* خلفية داكنة على الموبايل لما الدرج يفتح */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />

      <aside
        className={cn(
          // الموبايل: درج ثابت من اليمين (RTL) ومخفي لحد ما يتفتح
          "fixed inset-y-0 right-0 z-50 w-64 bg-card flex flex-col border-l border-border/50 transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
          // الديسكتوب: عمود ثابت في الـ layout
          "md:static md:z-auto md:w-56 md:min-h-screen md:translate-x-0 md:shrink-0"
        )}
      >
        {/* Logo */}
        <div className="p-5 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center text-white font-bold text-sm">EG</div>
            <div>
              <p className="text-xs font-bold text-accent leading-none">Electro George</p>
              <p className="text-[10px] text-subtext leading-none mt-0.5">قسم التجميع</p>
            </div>
          </div>
          <button onClick={onClose} className="md:hidden p-1.5 text-subtext hover:text-text" aria-label="قفل القائمة">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {items.map(({ href, icon: Icon, label }) => {
            const active = path === href || path.startsWith(href + "/");
            return (
              <Link key={href} href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all",
                  active
                    ? "bg-accent text-white font-semibold"
                    : "text-subtext hover:bg-border/50 hover:text-text"
                )}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
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
    </>
  );
}
