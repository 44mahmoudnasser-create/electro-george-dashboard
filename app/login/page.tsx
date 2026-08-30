"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-accent rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-accent/20">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-text">Electro George</h1>
          <p className="text-sm text-subtext mt-1">نظام متابعة قسم التجميع</p>
        </div>

        <div className="eg-card">
          <h2 className="text-base font-semibold text-text mb-5 text-center">تسجيل الدخول</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="eg-label">البريد الإلكتروني</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="eg-input" placeholder="admin@example.com" required />
            </div>
            <div>
              <label className="eg-label">كلمة المرور</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="eg-input" placeholder="••••••••" required />
            </div>
            {error && (
              <p className="text-xs text-danger bg-danger/10 rounded-lg p-3">{error}</p>
            )}
            <button type="submit" disabled={loading} className="eg-btn-primary w-full justify-center">
              {loading ? "جاري الدخول..." : "دخول"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
