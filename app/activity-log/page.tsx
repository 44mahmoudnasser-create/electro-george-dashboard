import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import ActivityLogClient from "./ActivityLogClient";
export const dynamic = "force-dynamic";

export default async function ActivityLogPage() {
  const supabase = createSupabaseServerClient();
  const { user, role } = await getUserRole();
  if (!user) redirect("/login");
  if (role !== "manager" && role !== "admin") redirect("/dashboard");

  const [{ data: logs }, { data: techs }] = await Promise.all([
    supabase.from("activity_log")
      .select("id, table_name, record_id, action, department, old_data, new_data, created_at, user:app_users(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("technicians").select("id, name"),
  ]);

  const techNames: Record<string, string> = Object.fromEntries((techs ?? []).map(t => [String(t.id), t.name]));

  return (
    <AppShell role={role}>
      <ActivityLogClient logs={(logs ?? []) as any[]} techNames={techNames} />
    </AppShell>
  );
}
