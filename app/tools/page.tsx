import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import ToolsClient from "./ToolsClient";
import { HOLDERS_SELECT, flattenHolders } from "@/lib/custody-holders";
export const dynamic = "force-dynamic";

export default async function ToolsPage() {
  const supabase = createSupabaseServerClient();
  const { user, role } = await getUserRole();
  if (!user) redirect("/login");
  if (role !== "admin" && role !== "manager") redirect("/dashboard");

  const [{ data: tools }, { data: items }, { data: techs }, { data: holders }] = await Promise.all([
    supabase.from("tools").select("*").order("name"),
    supabase.from("tool_items").select("id, tool_id, serial_no, status, notes").order("serial_no"),
    supabase.from("technicians").select("id, name, department").order("name"),
    supabase.from("custody").select(HOLDERS_SELECT).eq("status", "مستلمة").gt("open_qty", 0).order("issued_at"),
  ]);

  const departments = Array.from(new Set((techs ?? []).map(t => t.department).filter(Boolean) as string[])).sort();

  return (
    <AppShell role={role}>
      <ToolsClient
        initialTools={tools ?? []}
        initialItems={items ?? []}
        initialHolders={flattenHolders(holders ?? [])}
        technicians={(techs ?? []) as { id: number; name: string; department: string | null }[]}
        departments={departments}
      />
    </AppShell>
  );
}
