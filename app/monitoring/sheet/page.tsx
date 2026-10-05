import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import SheetMonitoringClient from "./SheetMonitoringClient";
export const dynamic = "force-dynamic";

export default async function SheetMonitoringPage() {
  const supabase = createSupabaseServerClient();
  const { user, role, department } = await getUserRole();
  if (!user) redirect("/login");

  const isManager = role === "manager";
  const isSheetDept = (department ?? "").toUpperCase() === "SHEET";
  if (!isManager && !isSheetDept) redirect("/dashboard");

  // الـ queue: كل البنود من كل أوامر الشغل اللي لسه الصاج ماخلصهاش
  const { data: items } = await supabase
    .from("wo_production_items")
    .select("id, work_order_id, qty, description, part_no, sheet_steel, thickness, qty_sheet, work_order:work_orders(wo_number, status)")
    .order("id", { ascending: true });

  const { data: machines } = await supabase
    .from("machines")
    .select("*")
    .eq("department", "SHEET")
    .eq("active", true)
    .order("name");

  const { data: settingRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "machine_required_for_log")
    .maybeSingle();

  return (
    <AppShell role={role}>
      <SheetMonitoringClient
        initialItems={items ?? []}
        initialMachines={machines ?? []}
        machineRequired={!!settingRow?.value}
        role={role}
      />
    </AppShell>
  );
}
