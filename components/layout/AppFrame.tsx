"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Sidebar, { Avatar, BrandMark, type CurrentUser } from "./Sidebar";

/* ═══════════════════════════════════════════════════════════════
   إطار التطبيق (القائمة الجانبية + شريط الموبايل) — متركّب في app/layout.tsx
   علشان يفضل ثابت بين الصفحات (مايتعملهوش تحميل من الأول مع كل تنقل).
   صفحة تسجيل الدخول بتظهر من غير الإطار.
   ═══════════════════════════════════════════════════════════════ */

const BARE_PATHS = ["/login"];
const COLLAPSE_COOKIE = "eg_sidebar";

export type ShellUser = CurrentUser & { id: string };

export default function AppFrame({
  initialUser, initialCollapsed, children,
}: {
  initialUser: ShellUser | null;
  initialCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [user, setUser] = useState<ShellUser | null>(initialUser);
  const userIdRef = useRef(initialUser?.id ?? null);

  // بيانات المستخدم بتتحدث لو سجّل دخول أو خروج من غير تحميل الصفحة
  useEffect(() => {
    const load = async (authUser: { id: string; email?: string; user_metadata?: Record<string, any> }) => {
      userIdRef.current = authUser.id;
      const metaRole = authUser.user_metadata?.role as string | undefined;
      const { data } = await supabase.from("app_users")
        .select("role, full_name, email, department")
        .eq("id", authUser.id)
        .maybeSingle();
      setUser({
        id: authUser.id,
        name: data?.full_name ?? (authUser.user_metadata?.full_name as string | undefined) ?? null,
        email: data?.email ?? authUser.email ?? null,
        role: data?.role ?? metaRole ?? "admin",
        department: data?.department ?? null,
      });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") { userIdRef.current = null; setUser(null); return; }
      const u = session?.user;
      if (u && (u.id !== userIdRef.current || event === "USER_UPDATED")) load(u);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (BARE_PATHS.includes(pathname)) return <>{children}</>;
  return <Shell user={user} initialCollapsed={initialCollapsed}>{children}</Shell>;
}

function Shell({ user, initialCollapsed, children }: {
  user: ShellUser | null; initialCollapsed: boolean; children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [isDesktop, setIsDesktop] = useState(false);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // نقفل الدرج لو الشاشة كبرت لمقاس الديسكتوب
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => { setIsDesktop(mq.matches); if (mq.matches) setDrawerOpen(false); };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      // كوكي علشان السيرفر يرسم القائمة بنفس الحالة من أول لحظة (من غير وميض)
      document.cookie = `${COLLAPSE_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:right-3 focus:top-3 focus:z-[300] focus:rounded-lg focus:bg-accent-solid focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        تخطي إلى المحتوى
      </a>

      <Sidebar
        user={user}
        open={drawerOpen}
        onClose={closeDrawer}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        isDesktop={isDesktop}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* شريط علوي للموبايل */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-card/90 px-3 backdrop-blur-xl md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="eg-icon-btn size-9"
            aria-label="فتح القائمة"
            aria-expanded={drawerOpen}
          >
            <Menu className="size-5" />
          </button>
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
            <BrandMark className="size-7 text-[11px]" />
            <span className="truncate text-sm font-bold text-text">مصنع إلكترو جورج</span>
          </Link>
          <button onClick={() => setDrawerOpen(true)} aria-label="بيانات المستخدم" className="rounded-full">
            <Avatar user={user} />
          </button>
        </header>

        <main id="main" tabIndex={-1} className="relative min-h-0 min-w-0 flex-1 overflow-y-auto outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
