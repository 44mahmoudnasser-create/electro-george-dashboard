import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import ActivityLogClient from "./ActivityLogClient";
export const dynamic = "force-dynamic";

const TABLE_LABELS: Record<string, string> = {
  technicians: "الفنيين",
  work_orders: "أوامر الشغل",
  purchases: "طلبات الشراء",
  files: "الملفات",
  attendance: "الحضور",
  violations: "المخالفات",
  skills: "المهارات",
  wo_bom_items: "BOM",
  wo_production_items: "قائمة الإنتاج",
};

export default async function ActivityLogPage() {
  const supabase = createSupabaseServerClient();
  const { user, role } = await getUserRole();
  if (!user) redirect("/login");
  if (role !== "manager" && role !== "admin") redirect("/dashboard");

  const { data: logs } = await supabase
    .from("activity_log")
    .select("*, user:app_users(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(300);

  return (
    <AppShell role={role}>
      <ActivityLogClient logs={logs ?? []} tableLabels={TABLE_LABELS} />
    </AppShell>
  );
}
