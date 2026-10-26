"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronsUpDown, KeyRound, LogOut, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { navGroupsForRole, isActivePath } from "@/lib/nav";
import { roleLabel, deptLabel, initials } from "@/lib/roles";
import { subscribeToPush } from "@/lib/push";
import { useToast } from "@/components/ui/Toast";
import Tooltip from "@/components/ui/Tooltip";
import Spinner from "@/components/ui/Spinner";
import ChangePasswordModal from "./ChangePasswordModal";

export type CurrentUser = {
  id?: string;
  name: string | null;
  email: string | null;
  role: string;
  department: string | null;
};

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn(
      "grid shrink-0 place-items-center rounded-lg bg-gradient-to-b from-accent-solid to-[#2449b8] font-extrabold tracking-tight text-white shadow-button",
      className ?? "size-8 text-[12px]",
    )}>
      EG
    </span>
  );
}

export function Avatar({ user, className }: { user: CurrentUser | null; className?: string }) {
  return (
    <span className={cn(
      "grid shrink-0 place-items-center rounded-full bg-accent/15 font-bold text-accent ring-1 ring-inset ring-accent/25",
      className ?? "size-8 text-[11px]",
    )}>
      {initials(user?.name, user?.email)}
    </span>
  );
}

export default function Sidebar({
  user, open, onClose, collapsed, onToggleCollapsed, isDesktop,
}: {
  user: CurrentUser | null;
  open: boolean;              // درج الموبايل
  onClose: () => void;
  collapsed: boolean;         // تصغير القائمة على الشاشات الكبيرة
  onToggleCollapsed: () => void;
  isDesktop: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const toast = useToast();
  const role = user?.role ?? "secretary";
  const groups = navGroupsForRole(role);
  const asideRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const mini = collapsed && isDesktop;   // أيقونات بس (مع تلميحات)

  // نقفل الدرج والقائمة بعد ما الرابط يتغير
  useEffect(() => { onClose(); setMenuOpen(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [path]);

  // Esc يقفل الدرج أو قائمة المستخدم
  useEffect(() => {
    if (!open && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (menuOpen) setMenuOpen(false); else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, menuOpen, onClose]);

  // الضغط برا قائمة المستخدم يقفلها
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  // الدرج المقفول على الموبايل مايتوصلش له بالكيبورد
  useEffect(() => {
    const el = asideRef.current as (HTMLElement & { inert?: boolean }) | null;
    if (el) el.inert = !isDesktop && !open;
  }, [open, isDesktop]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const enablePush = async () => {
    if (!user?.id) return;
    setPushBusy(true);
    try {
      const ok = await subscribeToPush(user.id);
      if (ok) toast.success("تم تفعيل إشعارات الحضور على الجهاز ده");
      else toast.error("ماقدرناش نفعّل الإشعارات. اتأكد إنك سمحت بيها من إعدادات المتصفح");
    } catch (e) {
      toast.error((e as Error).message || "حصلت مشكلة، حاول تاني");
    }
    setPushBusy(false);
    setMenuOpen(false);
  };

  const displayName = user?.name || user?.email || "—";
  const canPush = ["manager", "admin"].includes(role) && !!user?.id;

  return (
    <>
      {/* خلفية داكنة على الموبايل لما الدرج يفتح */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] transition-opacity duration-300 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        ref={asideRef}
        aria-label="القائمة الرئيسية"
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-72 max-w-[85vw] flex-col border-l border-border/70 bg-card shadow-2xl",
          "transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
          "md:relative md:inset-auto md:z-auto md:max-w-none md:translate-x-0 md:bg-bg md:shadow-none md:transition-[width] md:duration-200",
          collapsed ? "md:w-[4.5rem]" : "md:w-64",
        )}
      >
        {/* الشعار */}
        <div className={cn("flex h-16 shrink-0 items-center gap-3 border-b border-border/60 px-4", collapsed && "md:justify-center md:px-0")}>
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3 rounded-lg" aria-label="لوحة التحكم">
            <BrandMark />
            <span className={cn("min-w-0", collapsed && "md:hidden")}>
              <span className="block truncate text-sm font-bold leading-5 text-text">مصنع إلكترو جورج</span>
              <span className="block truncate text-[11px] leading-4 text-subtext">نظام إدارة المصنع</span>
            </span>
          </Link>
          <button onClick={onClose} className="eg-icon-btn mr-auto size-8 md:hidden" aria-label="قفل القائمة">
            <X className="size-4" />
          </button>
        </div>

        {/* الروابط */}
        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
          {groups.map((g, gi) => (
            <div key={g.key} className={gi === 0 ? "pt-3" : "pt-1"}>
              <p className={cn("px-2.5 pb-1 pt-2.5 text-[11px] font-semibold leading-4 text-muted", collapsed && "md:hidden", gi === 0 && "pt-0")}>
                {g.label}
              </p>
              {gi > 0 && collapsed && <div aria-hidden className="mx-3 my-2 hidden border-t border-border/60 md:block" />}
              <ul className="space-y-0.5">
                {g.items.map(({ href, icon: Icon, label }) => {
                  const active = isActivePath(path, href);
                  return (
                    <li key={href}>
                      <Tooltip content={mini ? label : null} side="left" className="flex w-full">
                        <Link
                          href={href}
                          aria-current={active ? "page" : undefined}
                          aria-label={mini ? label : undefined}
                          className={cn(
                            "group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-[7px] text-[13px] font-medium leading-5 transition-colors duration-150",
                            active
                              ? "bg-card2 text-text shadow-card ring-1 ring-inset ring-border/70"
                              : "text-subtext hover:bg-card2/60 hover:text-text",
                            collapsed && "md:justify-center md:px-0",
                          )}
                        >
                          {active && <span aria-hidden className="absolute inset-y-2 -right-3 w-[3px] rounded-l-full bg-accent" />}
                          <Icon
                            strokeWidth={1.9}
                            className={cn("size-[18px] shrink-0 transition-colors", active ? "text-accent" : "text-muted group-hover:text-subtext")}
                          />
                          <span className={cn("truncate", collapsed && "md:hidden")}>{label}</span>
                        </Link>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* تصغير / توسيع القائمة (ديسكتوب) */}
        <div className="hidden px-3 pb-2 md:block">
          <Tooltip content={mini ? "توسيع القائمة" : null} side="left" className="flex w-full">
            <button
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "توسيع القائمة" : "تصغير القائمة"}
              aria-expanded={!collapsed}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] text-subtext transition-colors hover:bg-card2/60 hover:text-text",
                collapsed && "justify-center px-0",
              )}
            >
              {collapsed ? <PanelRightOpen className="size-[18px]" strokeWidth={1.9} /> : <PanelRightClose className="size-[18px]" strokeWidth={1.9} />}
              <span className={cn(collapsed && "hidden")}>تصغير القائمة</span>
            </button>
          </Tooltip>
        </div>

        {/* المستخدم الحالي */}
        <div ref={menuRef} className="relative border-t border-border/60 p-3">
          <button
            onClick={() => setMenuOpen(v => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg p-1.5 text-start transition-colors hover:bg-card2/70",
              menuOpen && "bg-card2/70",
              collapsed && "md:justify-center",
            )}
          >
            <Avatar user={user} />
            <span className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
              <span className="block truncate text-[13px] font-semibold leading-5 text-text">{displayName}</span>
              <span className="block truncate text-[11px] leading-4 text-subtext">
                {roleLabel(user?.role ?? role)} · {deptLabel(user?.department)}
              </span>
            </span>
            <ChevronsUpDown className={cn("size-4 shrink-0 text-muted", collapsed && "md:hidden")} />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute bottom-full right-3 left-3 z-10 mb-2 min-w-[15rem] animate-pop-in rounded-xl border border-border bg-card p-1.5 shadow-pop"
            >
              <div className="px-2.5 pb-2 pt-1.5">
                <p className="truncate text-[13px] font-semibold text-text">{displayName}</p>
                {user?.email && <p className="truncate text-[11px] text-subtext" dir="ltr">{user.email}</p>}
              </div>
              <div className="my-1 border-t border-border/60" />
              <MenuItem icon={KeyRound} onClick={() => { setMenuOpen(false); setPwOpen(true); }}>تغيير كلمة المرور</MenuItem>
              {canPush && (
                <MenuItem icon={Bell} onClick={enablePush} disabled={pushBusy}>
                  {pushBusy ? <span className="inline-flex items-center gap-2"><Spinner className="size-3.5" />جاري التفعيل...</span> : "تفعيل إشعارات الحضور"}
                </MenuItem>
              )}
              <div className="my-1 border-t border-border/60" />
              <MenuItem icon={LogOut} onClick={handleLogout} danger>تسجيل الخروج</MenuItem>
            </div>
          )}
        </div>
      </aside>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} email={user?.email ?? null} />
    </>
  );
}

function MenuItem({ icon: Icon, onClick, children, danger, disabled }: {
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] transition-colors disabled:opacity-60",
        danger ? "text-danger hover:bg-danger/10" : "text-text hover:bg-card2",
      )}
    >
      <Icon className={cn("size-4 shrink-0", danger ? "text-danger" : "text-subtext")} />
      {children}
    </button>
  );
}
