"use client";
import { useCallback, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import { supabase } from "@/lib/supabase";
import EnableNotificationsButton from "@/components/layout/EnableNotificationsButton";

export default function AppShell({
  children, role: initialRole
}: { children: React.ReactNode; role: string }) {
  const [role, setRole] = useState(initialRole);
  const [userId, setUserId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      // Read from metadata first (most reliable)
      const metaRole = user.user_metadata?.role as string | undefined;
      if (metaRole) { setRole(metaRole); return; }
      // Fallback: try app_users table
      supabase.from("app_users").select("role").eq("id", user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.role) setRole(data.role);
        });
    });
  }, []);

  // نقفل الدرج لو اتفتح الشاشة على الديسكتوب
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => { if (mq.matches) setDrawerOpen(false); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} open={drawerOpen} onClose={closeDrawer} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* شريط علوي للموبايل بزرار القايمة */}
        <header className="md:hidden sticky top-0 z-30 h-14 bg-card/95 backdrop-blur border-b border-border/50 flex items-center gap-3 px-4">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 -mr-2 rounded-lg text-text hover:bg-border/50"
            aria-label="فتح القائمة"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold text-accent">Electro George</span>
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
