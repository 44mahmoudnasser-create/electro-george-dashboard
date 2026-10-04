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

  // attendance query — مفلترة بالقسم لو مش manager
  let attendanceQuery = supabase
    .from("attendance")
    .select("*, technician:technicians!inner(name,route,department)")
    .eq("date", today);
  if (!isManager) {
    attendanceQuery = attendanceQuery.eq("technician.department", department);
  }

  // violations query — مفلترة بالقسم لو مش manager
  let violationsQuery = supabase
    .from("violations")
    .select("*, technician:technicians!inner(name,department)")
    .order("date", { ascending: false });
  if (!isManager) {
    violationsQuery = violationsQuery.eq("technician.department", department);
  }

  const [
    { data: wos },
    { data: attendance },
    { data: purchases },
    { data: violations },
  ] = await Promise.all([
    supabase.from("work_orders").select("*").order("id", { ascending: false }),
    attendanceQuery,
    supabase.from("purchases").select("*, work_order:work_orders(wo_number)").order("id", { ascending: false }),
    violationsQuery,
  ]);

  return (
    <AppShell role={role}>
      <DashboardClient
        wos={wos ?? []}
        attendance={attendance ?? []}
        purchases={purchases ?? []}
        violations={violations ?? []}
        today={today}
        thisMonth={thisMonth}
        role={role}
      />
    </AppShell>
  );
}
