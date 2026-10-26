"use client";
import { useState } from "react";
import { Bell } from "lucide-react";
import { subscribeToPush } from "@/lib/push";
import { useToast } from "@/components/ui/Toast";
import Spinner from "@/components/ui/Spinner";

// زرار تفعيل إشعارات الحضور (للمدير والأدمن).
// في الإطار الجديد نفس الخيار موجود في قائمة المستخدم تحت في القائمة الجانبية.
export default function EnableNotificationsButton({ userId, role }: { userId: string; role: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!["manager", "admin"].includes(role)) return null;

  const handleClick = async () => {
    setBusy(true);
    try {
      const ok = await subscribeToPush(userId);
      if (ok) toast.success("تم تفعيل الإشعارات");
      else toast.error("حصلت مشكلة، حاول تاني");
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <button onClick={handleClick} disabled={busy} className="eg-btn-ghost">
      {busy ? <Spinner /> : <Bell className="size-4" />} تفعيل إشعارات الحضور
    </button>
  );
}
