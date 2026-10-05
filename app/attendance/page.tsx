import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import AttendanceClient from "./AttendanceClient";
export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const supabase = createSupabaseServerClient();
  const { user, role, department } = await getUserRole();
  if (!user) redirect("/login");

  const isManager = role === "manager";

  let techQuery = supabase.from("technicians").select("*").order("name");
  if (!isManager) {
    techQuery = techQuery.eq("department", department);
  }
  const { data: technicians } = await techQuery;

  let departments: string[] = [];
  if (isManager) {
    const { data: deptRows } = await supabase
      .from("technicians")
      .select("department")
      .not("department", "is", null);
    departments = Array.from(new Set((deptRows ?? []).map(d => d.department))).sort();
  }

  // سنة كاملة من بيانات الحضور (أساس حساب إحصائيات الشهر والسنة)
  const yearStr = new Date().getFullYear().toString();
  const { data: yearAttendance } = await supabase
    .from("attendance")
    .select("tech_id, date, status")
    .gte("date", `${yearStr}-01-01`)
    .lte("date", `${yearStr}-12-31`);

  return (
    <AppShell role={role}>
      <AttendanceClient
        initialTechnicians={technicians ?? []}
        role={role}
        department={department}
        isManager={isManager}
        departments={departments}
        initialYearAttendance={yearAttendance ?? []}
      />
    </AppShell>
  );
}
