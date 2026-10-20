"use client";
import { useCallback, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import Sidebar, { type CurrentUser } from "./Sidebar";
import { supabase } from "@/lib/supabase";
import EnableNotificationsButton from "@/components/layout/EnableNotificationsButton";
import { initials } from "@/lib/roles";

export default function AppShell({
  children, role: initialRole
}: { children: React.ReactNode; role: string }) {
  const [role, setRole] = useState(initialRole);
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);

      const metaRole = user.user_metadata?.role as string | undefined;
      if (metaRole) setRole(metaRole);

      // بيانات المستخدم الكاملة من app_users (الاسم والقسم والدور)
      supabase.from("app_users")
        .select("role, full_name, email, department")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          const r = data?.role ?? metaRole ?? initialRole;
          if (data?.role) setRole(data.role);
          setMe({
            name: data?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
            email: data?.email ?? user.email ?? null,
            role: r,
            department: data?.department ?? null,
          });
        });
    });
  }, [initialRole]);

  // نقفل الدرج لو اتفتحت الشاشة على الديسكتوب
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => { if (mq.matches) setDrawerOpen(false); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} user={me} open={drawerOpen} onClose={closeDrawer} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* شريط علوي للموبايل */}
        <header className="md:hidden sticky top-0 z-30 h-14 bg-card/95 backdrop-blur border-b border-border/50 flex items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-2 -mr-2 rounded-lg text-text hover:bg-border/50"
              aria-label="فتح القائمة"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold text-accent truncate">مصنع إلكترو جورج</span>
          </div>
          <button onClick={() => setDrawerOpen(true)}
            className="w-8 h-8 shrink-0 rounded-full bg-accent/20 text-accent text-[11px] font-bold flex items-center justify-center"
            aria-label="بيانات المستخدم">
            {initials(me?.name, me?.email)}
          </button>
        </header>

        <main className="flex-1 min-w-0 overflow-auto">
          {userId && (
            <div className="flex justify-end p-3">
              <EnableNotificationsButton userId={userId} role={role} />
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
