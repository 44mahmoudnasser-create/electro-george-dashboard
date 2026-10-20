import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const { user, role, department } = await getUserRole();
  if (!user) redirect("/login");

  const isManager = role === "manager";
  const today = new Date().toISOString().split("T")[0];
  const thisMonth = today.slice(0, 7);

  // الحضور اليومي — مفلتر بالقسم لو مش manager
  let attendanceQuery = supabase
    .from("attendance")
    .select("id, status, technician:technicians!inner(name, department)")
    .eq("date", today);
  if (!isManager) attendanceQuery = attendanceQuery.eq("technician.department", department);

  // المخالفات — بنحتاج عددها بس للتنبيهات
  let violationsQuery = supabase
    .from("violations")
    .select("id, date, technician:technicians!inner(department)")
    .gte("date", `${thisMonth}-01`)
    .order("date", { ascending: false });
  if (!isManager) violationsQuery = violationsQuery.eq("technician.department", department);

  const [{ data: wos }, { data: attendance }, { data: purchaseItems }, { data: violations }] = await Promise.all([
    supabase.from("work_orders")
      .select("id, wo_number, description, status, priority, plan_month, expected_delivery, completion_date, department")
      .order("expected_delivery", { ascending: true, nullsFirst: false }),
    attendanceQuery,
    supabase.from("purchase_items")
      .select("id, item_name, status, supply_date, purchase_order:purchase_orders(order_no, work_order:work_orders(wo_number))")
      .neq("status", "ملغي")
      .order("id", { ascending: false })
      .limit(300),
    violationsQuery,
  ]);

  return (
    <AppShell role={role}>
      <DashboardClient
        wos={(wos ?? []) as any[]}
        attendance={(attendance ?? []) as any[]}
        purchaseItems={(purchaseItems ?? []) as any[]}
        violationsThisMonth={violations?.length ?? 0}
        today={today}
        thisMonth={thisMonth}
        role={role}
      />
    </AppShell>
  );
}
