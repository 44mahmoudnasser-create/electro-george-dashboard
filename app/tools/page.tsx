import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import ToolsClient from "./ToolsClient";
export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const supabase = createSupabaseServerClient();
  const { user, role } = await getUserRole();
  if (!user) redirect("/login");
  if (role !== "admin" && role !== "manager") redirect("/dashboard");

  const [{ data: tools }, { data: items }, { data: techs }] = await Promise.all([
    supabase.from("tools").select("*").order("name"),
    supabase.from("tool_items").select("id, tool_id, serial_no, status, notes").order("serial_no"),
    supabase.from("technicians").select("department"),
  ]);

  const departments = Array.from(new Set((techs ?? []).map(t => t.department).filter(Boolean) as string[])).sort();

  return (
    <AppShell role={role}>
      <ToolsClient initialTools={tools ?? []} initialItems={items ?? []} departments={departments} />
    </AppShell>
  );
}
