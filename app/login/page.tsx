"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogIn, Mail, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { BrandMark } from "@/components/layout/Sidebar";
import { FormError } from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";

// رسائل Supabase بتيجي بالإنجليزي — نترجم الشائع منها
const loginError = (message: string) => {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "البريد الإلكتروني أو كلمة المرور غير صحيحة";
  if (m.includes("email not confirmed")) return "الحساب ده لسه ماتأكدش من الإيميل";
  if (m.includes("rate limit") || m.includes("too many")) return "محاولات كتير ورا بعض، استنى شوية وجرّب تاني";
  if (m.includes("fetch") || m.includes("network")) return "مفيش اتصال بالسيرفر، اتأكد من الإنترنت";
  return message;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(loginError(error.message)); setLoading(false); return; }
    router.push("/dashboard");
  };

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-4 py-10">
      {/* إضاءة خفيفة في الخلفية */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-12rem] h-[28rem] w-[44rem] -translate-x-1/2 rounded-full bg-accent-solid/15 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgb(var(--bg))_70%)]" />
      </div>

      <main className="relative w-full max-w-sm animate-page-in">
        <div className="mb-7 flex flex-col items-center text-center">
          <BrandMark className="size-12 rounded-xl text-base" />
          <h1 className="mt-4 text-xl font-bold text-text">مصنع إلكترو جورج</h1>
          <p className="mt-1 text-sm text-subtext">نظام إدارة المصنع</p>
        </div>

        <div className="eg-card !p-6 shadow-pop">
          <h2 className="text-base font-semibold text-text">تسجيل الدخول</h2>
          <p className="mt-0.5 text-xs text-subtext">ادخل بالإيميل وكلمة المرور الخاصين بيك.</p>

          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div>
              <label htmlFor="email" className="eg-label">البريد الإلكتروني</label>
              <div className="relative">
                <Mail aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="eg-input pr-9" placeholder="name@example.com" autoComplete="email" dir="ltr"
                  required autoFocus />
              </div>
            </div>
            <div>
              <label htmlFor="password" className="eg-label">كلمة المرور</label>
              <div className="relative">
                <Lock aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input id="password" type={showPassword ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="eg-input pl-10 pr-9" placeholder="••••••••" autoComplete="current-password" dir="ltr" required />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  className="eg-icon-btn absolute left-1.5 top-1/2 -translate-y-1/2">
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <FormError>{error}</FormError>
            <button type="submit" disabled={loading} className="eg-btn-primary w-full">
              {loading ? <Spinner /> : <LogIn className="size-4" />}
              {loading ? "جاري الدخول..." : "دخول"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
