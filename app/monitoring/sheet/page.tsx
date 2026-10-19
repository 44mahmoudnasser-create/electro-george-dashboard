import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import SheetMonitoringClient from "./SheetMonitoringClient";
export const dynamic = "force-dynamic";

// .in() بيتبعت في الـ URL — نقسم القوائم الكبيرة علشان مايعديش حد الطول
const CHUNK = 200;
const chunks = <T,>(arr: T[]) =>
  Array.from({ length: Math.ceil(arr.length / CHUNK) }, (_, i) => arr.slice(i * CHUNK, (i + 1) * CHUNK));

export default async function SheetMonitoringPage() {
  const supabase = createSupabaseServerClient();
  const { user, role, department } = await getUserRole();
  if (!user) redirect("/login");

  const isManager = role === "manager";
  const isSheetDept = (department ?? "").toUpperCase() === "SHEET";
  if (!isManager && !isSheetDept) redirect("/dashboard");

  const { data: allItems } = await supabase
    .from("wo_production_items")
    .select("id, work_order_id, qty, description, part_no, sheet_steel, thickness, qty_sheet, sheet_route, sort_order, work_order:work_orders(wo_number, status, priority, expected_delivery)")
    .order("id", { ascending: true });

  // نحتفظ بس باللي لسه الصاج ماخلصهوش، من أوامر لسه ماتسلمتش
  const items = (allItems ?? []).filter((it: any) => {
    const wo = Array.isArray(it.work_order) ? it.work_order[0] : it.work_order;
    return (it.qty ?? 0) - (it.qty_sheet ?? 0) > 0 && wo?.status !== "تم التسليم";
  });
  const ids = items.map((it: any) => it.id as number);

  const substages: any[] = [];
  const lockedIds = new Set<number>();
  for (const part of chunks(ids)) {
    const [{ data: subs }, { data: logs }] = await Promise.all([
      supabase.from("wo_item_substages").select("id, production_item_id, stage, qty_done").in("production_item_id", part),
      supabase.from("wo_substage_log").select("production_item_id").in("production_item_id", part),
    ]);
    substages.push(...(subs ?? []));
    (logs ?? []).forEach((l: any) => lockedIds.add(l.production_item_id));
  }

  // كل مكن الصاج (الفعّال والمعطّل) — الفلترة في الواجهة
  const { data: machines } = await supabase
    .from("machines")
    .select("id, name, department, notes, active, stage")
    .eq("department", "SHEET")
    .order("name");

  const { data: settingRow } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "machine_required_for_log")
    .maybeSingle();

  return (
    <AppShell role={role}>
      <SheetMonitoringClient
        initialItems={items as any}
        initialMachines={machines ?? []}
        initialSubstages={substages}
        initialLockedIds={Array.from(lockedIds)}
        machineRequired={!!settingRow?.value}
      />
    </AppShell>
  );
}
