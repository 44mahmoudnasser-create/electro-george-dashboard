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

  // بيانات الحضور للسنة الحالية والسنة اللي قبلها (أساس الإحصائيات)
  // Supabase بيرجع 1000 صف كحد أقصى للطلب، فبنقرا على دفعات لحد ما نخلص (علشان الأرقام تبقى صح)
  const yearStr = new Date().getFullYear().toString();
  const PAGE = 1000;
  const yearAttendance: { id: number; tech_id: number; date: string; status: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("attendance")
      .select("id, tech_id, date, status")
      .gte("date", `${Number(yearStr) - 1}-01-01`)
      .lte("date", `${yearStr}-12-31`)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    yearAttendance.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  return (
    <AppShell role={role}>
      <AttendanceClient
        initialTechnicians={technicians ?? []}
        role={role}
        department={department}
        isManager={isManager}
        departments={departments}
        initialYearAttendance={yearAttendance}
      />
    </AppShell>
  );
}
