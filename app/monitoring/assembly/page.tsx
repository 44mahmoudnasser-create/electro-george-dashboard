import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import AssemblyMonitoringClient from "./AssemblyMonitoringClient";
export const dynamic = "force-dynamic";

export default async function AssemblyMonitoringPage() {
  const supabase = createSupabaseServerClient();
  const { user, role, department } = await getUserRole();
  if (!user) redirect("/login");

  const [
    { data: items }, { data: prod }, { data: boms }, { data: shortages },
    { data: groups }, { data: members }, { data: itemAssembly }, { data: mechStatus },
    { data: history }, { data: techs }, { data: deptRows },
  ] = await Promise.all([
    supabase.from("work_order_items")
      .select("id, wo_id, item_no, description, qty, job_status, priority, expected_delivery, plan_month, work_order:work_orders(wo_number, client_name, project_name)")
      .eq("status", "approved")
      .order("expected_delivery", { ascending: true, nullsFirst: false }),
    supabase.from("wo_production_items")
      .select("id, work_order_item_id, description, qty, qty_sheet, qty_assembly")
      .not("work_order_item_id", "is", null),
    supabase.from("wo_bom_items")
      .select("id, work_order_item_id, description, qty, qty_dispensed, unit")
      .not("work_order_item_id", "is", null),
    supabase.from("assembly_shortages").select("*").order("created_at", { ascending: false }),
    supabase.from("assembly_groups").select("id, name, supervisor_id, active").order("name"),
    supabase.from("assembly_group_members").select("group_id, tech_id, technician:technicians(id, name, grade)"),
    supabase.from("item_assembly").select("*"),
    supabase.from("wo_department_status").select("item_id, status, updated_at").eq("department", "MECH_ASSEMBLY"),
    supabase.from("wo_status_history")
      .select("item_id, from_status, to_status, changed_at, note, user:app_users(full_name, email)")
      .eq("department", "MECH_ASSEMBLY")
      .order("changed_at", { ascending: false })
      .limit(300),
    supabase.from("technicians").select("id, name, grade, department").order("name"),
    supabase.from("departments").select("code, aliases").eq("active", true),
  ]);

  // تحويل قسم المستخدم للكود (نفس منطق صفحة الأمر)
  const raw = (department ?? "").trim().toLowerCase();
  const myCode = (deptRows ?? []).find((d: any) =>
    (d.aliases ?? []).some((a: string) => a.trim().toLowerCase() === raw))?.code ?? null;
  const canEdit = role === "manager" || myCode === "MECH_ASSEMBLY";

  return (
    <AppShell role={role}>
      <AssemblyMonitoringClient
        items={(items ?? []) as any[]}
        prod={(prod ?? []) as any[]}
        boms={(boms ?? []) as any[]}
        shortages={(shortages ?? []) as any[]}
        groups={(groups ?? []) as any[]}
        members={(members ?? []) as any[]}
        itemAssembly={(itemAssembly ?? []) as any[]}
        mechStatus={(mechStatus ?? []) as any[]}
        history={(history ?? []) as any[]}
        techs={(techs ?? []) as any[]}
        canEdit={canEdit}
      />
    </AppShell>
  );
}
