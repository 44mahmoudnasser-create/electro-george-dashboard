"use client";
import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { supabase } from "@/lib/supabase";

const MIN_LENGTH = 8;

export default function ChangePasswordModal({
  open, onClose, email,
}: {
  open: boolean;
  onClose: () => void;
  email: string | null;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const reset = () => {
    setCurrent(""); setNext(""); setConfirm("");
    setError(""); setDone(false); setBusy(false);
  };

  const close = () => { reset(); onClose(); };

  const submit = async () => {
    setError("");
    if (!email) { setError("مش لاقي الإيميل بتاعك"); return; }
    if (!current) { setError("اكتب كلمة المرور الحالية"); return; }
    if (next.length < MIN_LENGTH) { setError(`كلمة المرور الجديدة لازم تكون ${MIN_LENGTH} حروف على الأقل`); return; }
    if (next === current) { setError("كلمة المرور الجديدة لازم تختلف عن الحالية"); return; }
    if (next !== confirm) { setError("تأكيد كلمة المرور مش مطابق"); return; }

    setBusy(true);
    // نتأكد من الباسورد الحالي الأول، عشان أي حد يلاقي الجهاز مفتوح ما يقدرش يغيّره
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password: current });
    if (signErr) { setBusy(false); setError("كلمة المرور الحالية غلط"); return; }

    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (updErr) { setError(updErr.message); return; }

    setDone(true);
    setTimeout(close, 1500);
  };

  return (
    <Modal open={open} onClose={close} title="تغيير كلمة المرور" size="sm">
      {done ? (
        <p className="text-sm text-success text-center py-4">تم تغيير كلمة المرور بنجاح ✓</p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="eg-label">كلمة المرور الحالية</label>
            <input type="password" autoComplete="current-password" value={current}
              onChange={e => setCurrent(e.target.value)} className="eg-input" />
          </div>
          <div>
            <label className="eg-label">كلمة المرور الجديدة</label>
            <input type="password" autoComplete="new-password" value={next}
              onChange={e => setNext(e.target.value)} className="eg-input" placeholder={`${MIN_LENGTH} حروف على الأقل`} />
          </div>
          <div>
            <label className="eg-label">تأكيد كلمة المرور الجديدة</label>
            <input type="password" autoComplete="new-password" value={confirm}
              onChange={e => setConfirm(e.target.value)} className="eg-input"
              onKeyDown={e => e.key === "Enter" && submit()} />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={submit} disabled={busy} className="eg-btn-primary w-full justify-center">
            {busy ? "جاري التغيير..." : "تغيير كلمة المرور"}
          </button>
        </div>
      )}
    </Modal>
  );
}
