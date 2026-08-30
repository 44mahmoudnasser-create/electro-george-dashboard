import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();
  const { user, role } = await getUserRole();
  if (!user) redirect("/login");

  const today = new Date().toISOString().split("T")[0];
  const thisMonth = today.slice(0, 7); // صيغة "YYYY-MM"

  const [
    { data: wos },
    { data: attendance },
    { data: purchases },
    { data: violations },
  ] = await Promise.all([
    supabase.from("work_orders").select("*").order("id", { ascending: false }),
    supabase.from("attendance").select("*, technician:technicians(name,route)").eq("date", today),
    supabase.from("purchases").select("*, work_order:work_orders(wo_number)").order("id", { ascending: false }),
    supabase.from("violations").select("*, technician:technicians(name)").gte("date", thisMonth + "-01"),
  ]);

  // فلترة الأوامر المطلوب تسليمها هذا الشهر (مع استبعاد المستلمة أو حسب رغبتك)
  const expectedDeliveriesThisMonth = (wos ?? []).filter((wo) => 
    wo.expected_delivery && wo.expected_delivery.startsWith(thisMonth)
  );

  return (
    <AppShell role={role}>
      <DashboardClient
        wos={wos ?? []}
        attendance={attendance ?? []}
        purchases={purchases ?? []}
        violations={violations ?? []}
        expectedDeliveries={expectedDeliveriesThisMonth}
        today={today}
        thisMonth={thisMonth}
        role={role}
      />
    </AppShell>
  );
}