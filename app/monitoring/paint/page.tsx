import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import PaintMonitoringClient from "./PaintMonitoringClient";
export const dynamic = "force-dynamic";

export default async function PaintMonitoringPage() {
  const supabase = createSupabaseServerClient();
  const { user, role, department } = await getUserRole();
  if (!user) redirect("/login");

  const isManager = role === "manager";
  const isPaintDept = (department ?? "").toUpperCase() === "PAINT";
  if (!isManager && !isPaintDept) redirect("/dashboard");

  // البنود اللي محتاجة دهان ولسه فيها شغل، من أوامر لسه ماتسلمتش
  const { data: rows } = await supabase
    .from("wo_production_items")
    .select("id, work_order_id, qty, description, part_no, sheet_steel, thickness, qty_sheet, qty_paint, paint_type_id, work_order:work_orders(wo_number, status, priority, expected_delivery)")
    .eq("required_painting", "YES")
    .order("id", { ascending: true });

  const items = (rows ?? []).filter((it: any) => {
    const wo = Array.isArray(it.work_order) ? it.work_order[0] : it.work_order;
    return (it.qty ?? 0) - (it.qty_paint ?? 0) > 0 && wo?.status !== "تم التسليم";
  });

  const { data: paintTypes } = await supabase
    .from("paint_types")
    .select("id, name, active")
    .order("name");

  return (
    <AppShell role={role}>
      <PaintMonitoringClient
        initialItems={items as any}
        initialPaintTypes={paintTypes ?? []}
      />
    </AppShell>
  );
}
