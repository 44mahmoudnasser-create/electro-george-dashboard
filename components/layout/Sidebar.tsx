"use client";
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { KeyRound, LogOut, X } from "lucide-react";
import { useState } from "react";
import ChangePasswordModal from "./ChangePasswordModal";
import { supabase } from "@/lib/supabase";
import { navForRole } from "@/lib/nav";
import { roleLabel, deptLabel, initials } from "@/lib/roles";

export type CurrentUser = {
  name: string | null;
  email: string | null;
  role: string;
  department: string | null;
};

export default function Sidebar({
  role, user, open, onClose,
}: {
  role: string;
  user: CurrentUser | null;
  open: boolean;      // بيتحكم فيه الموبايل بس
  onClose: () => void;
}) {
  const path = usePathname();
  const router = useRouter();
  const items = navForRole(role);
  const [pwOpen, setPwOpen] = useState(false);

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

  const displayName = user?.name || user?.email || "—";

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
          "fixed inset-y-0 right-0 z-50 w-64 bg-card flex flex-col border-l border-border/50 transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
          "md:sticky md:top-0 md:h-screen md:self-start md:z-auto md:w-60 md:translate-x-0 md:shrink-0"
        )}
      >
        {/* Logo */}
        <div className="p-5 border-b border-border/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center text-white font-bold text-sm">EG</div>
            <div>
              <p className="text-sm font-bold text-text leading-tight">مصنع إلكترو جورج</p>
              <p className="text-[10px] text-subtext leading-tight mt-0.5">Electro George Factory</p>
            </div>
          </div>
          <button onClick={onClose} className="md:hidden p-1.5 text-subtext hover:text-text" aria-label="قفل القائمة">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 min-h-0 p-3 space-y-0.5 overflow-y-auto">
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

        {/* المستخدم الحالي */}
        <div className="p-3 border-t border-border/50">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg bg-card2">
            <div className="w-9 h-9 shrink-0 rounded-full bg-accent/20 text-accent flex items-center justify-center text-xs font-bold">
              {initials(user?.name, user?.email)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-text truncate">{displayName}</p>
              <p className="text-[10px] text-subtext truncate">
                {roleLabel(user?.role ?? role)} · {deptLabel(user?.department)}
              </p>
            </div>
          </div>
          <button onClick={() => setPwOpen(true)}
            className="mt-2 flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-subtext hover:bg-border/50 hover:text-text w-full transition-all">
            <KeyRound className="w-4 h-4" />
            تغيير كلمة المرور
          </button>
          <button onClick={handleLogout}
            className="mt-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-subtext hover:bg-danger/10 hover:text-danger w-full transition-all">
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} email={user?.email ?? null} />
    </>
  );
}
