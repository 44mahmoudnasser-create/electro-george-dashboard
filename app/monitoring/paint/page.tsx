import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import PaintMonitoringClient from "./PaintMonitoringClient";
export const dynamic = "force-dynamic";

// اسم القسم في جدول machines وفي app_users.department — عدّله لو مختلف
const DEPT = "PAINT";
const CHUNK = 200;
const chunks = <T,>(arr: T[]) =>
  Array.from({ length: Math.ceil(arr.length / CHUNK) }, (_, i) => arr.slice(i * CHUNK, (i + 1) * CHUNK));

export default async function PaintMonitoringPage() {
  const supabase = createSupabaseServerClient();
  const { user, role, department } = await getUserRole();
  if (!user) redirect("/login");

  const isManager = role === "manager";
  const isPaintDept = (department ?? "").toUpperCase() === DEPT;
  if (!isManager && !isPaintDept) redirect("/dashboard");

  // البنود اللي الصاج طلعلها قطع (qty_sheet > 0) ولسه ماخلصتش الدهان/الأنودة/الفرن
  const { data: allItems } = await supabase
    .from("wo_production_items")
    .select("id, work_order_id, qty, description, part_no, sheet_steel, thickness, qty_sheet, qty_paint, required_painting, finish_route, work_order:work_orders(wo_number, status, priority, expected_delivery)")
    .gt("qty_sheet", 0)
    .order("id", { ascending: true });

  const items = (allItems ?? []).filter((it: any) => {
    const wo = Array.isArray(it.work_order) ? it.work_order[0] : it.work_order;
    return wo?.status !== "تم التسليم" && (it.qty ?? 0) > (it.qty_paint ?? 0);
  });
  const ids = items.map((it: any) => it.id as number);

  const progress: any[] = [];
  for (const part of chunks(ids)) {
    const { data } = await supabase
      .from("wo_finish_progress")
      .select("production_item_id, stage, qty_done")
      .in("production_item_id", part);
    progress.push(...(data ?? []));
  }

  const lockedIds: number[] = [];
  for (const part of chunks(ids)) {
    const { data } = await supabase.from("wo_finish_log").select("production_item_id").in("production_item_id", part);
    lockedIds.push(...Array.from(new Set((data ?? []).map((l: any) => l.production_item_id as number))));
  }

  const { data: machines } = await supabase
    .from("machines")
    .select("id, name, active, stage")
    .eq("department", DEPT)
    .eq("active", true)
    .order("name");

  const { data: settingRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "machine_required_for_log")
    .maybeSingle();

  return (
    <AppShell role={role}>
      <PaintMonitoringClient
        initialItems={items as any}
        initialProgress={progress}
        initialMachines={machines ?? []}
        initialLockedIds={Array.from(new Set(lockedIds))}
        machineRequired={!!settingRow?.value}
      />
    </AppShell>
  );
}
