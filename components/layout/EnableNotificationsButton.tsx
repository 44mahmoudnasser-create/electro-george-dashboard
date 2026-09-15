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