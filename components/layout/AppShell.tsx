"use client";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import { supabase } from "@/lib/supabase";

export default function AppShell({
  children, role: initialRole
}: { children: React.ReactNode; role: string }) {
  const [role, setRole] = useState(initialRole);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      // Read from metadata first (most reliable)
      const metaRole = user.user_metadata?.role as string | undefined;
      if (metaRole) { setRole(metaRole); return; }
      // Fallback: try app_users table
      supabase.from("app_users").select("role").eq("id", user.id).maybeSingle()
        .then(({ data }) => {
          if (data?.role) setRole(data.role);
          // If nothing found → keep initialRole (which defaults to "admin")
        });
    });
  }, []);



  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} />
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
  "use client";
import { subscribeToPush } from "@/lib/push";
import { Bell } from "lucide-react";

export default function EnableNotificationsButton({ userId, role }: { userId: string; role: string }) {
  if (!["manager", "admin"].includes(role)) return null;

  const handleClick = async () => {
    const ok = await subscribeToPush(userId);
    alert(ok ? "✅ تم تفعيل الإشعارات" : "❌ حصلت مشكلة، حاول تاني");
  };

  return (
    <button onClick={handleClick} className="eg-btn-ghost">
      <Bell className="w-4 h-4" /> تفعيل إشعارات الحضور
    </button>
  );
}
}
