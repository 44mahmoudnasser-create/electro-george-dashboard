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

  // المجاميع (لكل قسم) + أعضائها + أسماء الأقسام
  const [{ data: groupRows }, { data: memberRows }, { data: deptList }] = await Promise.all([
    supabase.from("assembly_groups")
      .select("id, name, department_code, supervisor_id, supervisor:technicians(name)")
      .eq("active", true).order("name"),
    supabase.from("assembly_group_members").select("group_id, tech_id"),
    supabase.from("departments").select("code, name_ar").eq("active", true).order("sort_no"),
  ]);
  const groups = (groupRows ?? []).map((g: any) => ({
    id: g.id, name: g.name, department_code: g.department_code, supervisor_id: g.supervisor_id ?? null,
    supervisorName: (Array.isArray(g.supervisor) ? g.supervisor[0]?.name : g.supervisor?.name) ?? null,
  }));

  // البنود المعتمدة اللي ممكن تتعين عليها الفنيين
  const { data: itemRows } = await supabase
    .from("work_order_items")
    .select("id, wo_id, item_no, description, work_order:work_orders(wo_number)")
    .eq("status", "approved")
    .not("job_status", "in", "(مكتمل,تم التسليم)")   // البنود المنتهية مابتظهرش في التعيين
    .order("wo_id", { ascending: true })
    .order("item_no", { ascending: true });
  const assignableItems = (itemRows ?? []).map((i: any) => ({
    id: i.id,
    wo_id: i.wo_id,
    item_no: i.item_no,
    description: i.description,
    wo_number: (Array.isArray(i.work_order) ? i.work_order[0]?.wo_number : i.work_order?.wo_number) ?? "—",
  }));

  return (
    <AppShell role={role}>
      <AttendanceClient
        assignableItems={assignableItems}
        groups={groups}
        groupMembers={(memberRows ?? []) as any[]}
        departmentList={(deptList ?? []) as any[]}
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
