"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Field, { FormError } from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { supabase } from "@/lib/supabase";

const MIN_LENGTH = 8;

export default function ChangePasswordModal({
  open, onClose, email,
}: {
  open: boolean;
  onClose: () => void;
  email: string | null;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setCurrent(""); setNext(""); setConfirm("");
    setError(""); setBusy(false);
  };

  const close = () => { reset(); onClose(); };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
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

    toast.success("تم تغيير كلمة المرور بنجاح");
    close();
  };

  return (
    <Modal open={open} onClose={close} title="تغيير كلمة المرور" description="للحماية، اكتب كلمة المرور الحالية الأول." size="sm">
      <form onSubmit={submit} className="space-y-4">
        <Field label="كلمة المرور الحالية">
          <input type="password" autoComplete="current-password" value={current} autoFocus
            onChange={e => setCurrent(e.target.value)} className="eg-input" dir="ltr" />
        </Field>
        <Field label="كلمة المرور الجديدة" hint={`${MIN_LENGTH} حروف على الأقل`}>
          <input type="password" autoComplete="new-password" value={next}
            onChange={e => setNext(e.target.value)} className="eg-input" dir="ltr" />
        </Field>
        <Field label="تأكيد كلمة المرور الجديدة">
          <input type="password" autoComplete="new-password" value={confirm}
            onChange={e => setConfirm(e.target.value)} className="eg-input" dir="ltr" />
        </Field>
        <FormError>{error}</FormError>
        <button type="submit" disabled={busy} className="eg-btn-primary w-full">
          {busy ? <Spinner /> : <KeyRound className="size-4" />}
          {busy ? "جاري التغيير..." : "تغيير كلمة المرور"}
        </button>
      </form>
    </Modal>
  );
}
