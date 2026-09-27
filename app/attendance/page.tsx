import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import AttendanceClient from "./AttendanceClient";
export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, department")
    .eq("id", user.id)
    .single();

  const role = appUser?.role ?? "secretary";
  const department = appUser?.department ?? null;
  const isManager = role === "manager";

  // لو manager، هات كل الفنيين + قايمة الأقسام المتاحة
  let techQuery = supabase.from("technicians").select("*").order("name");
  if (!isManager) {
    techQuery = techQuery.eq("department", department);
  }

  const { data: technicians } = await techQuery;

  // قايمة الأقسام (بس لو manager محتاجها للـ selector)
  let departments: string[] = [];
  if (isManager) {
    const { data: deptRows } = await supabase
      .from("technicians")
      .select("department")
      .not("department", "is", null);
departments = Array.from(new Set((deptRows ?? []).map(d => d.department))).sort();  }

  return (
    <AppShell role={role}>
      <AttendanceClient
        initialTechnicians={technicians ?? []}
        role={role}
        department={department}
        isManager={isManager}
        departments={departments}
      />
    </AppShell>
  );
}
