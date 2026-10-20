import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect, notFound } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import WODetailClient from "./WODetailClient";
export const dynamic = "force-dynamic";

export default async function WODetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { user, role, department } = await getUserRole();
  if (!user) redirect("/login");

  const woId = parseInt(params.id);
  if (isNaN(woId)) notFound();

  const [
    { data: wo },
    { data: productivity },
    { data: files },
    { data: purchases },
    { data: prodItems },
    { data: bomItems },
    { data: deptRows },
    { data: departmentRows },
  ] = await Promise.all([
    supabase.from("work_orders").select("*").eq("id", woId).single(),
    supabase.from("daily_productivity")
      .select("work_date, task, notes, technicians(name)")
      .eq("wo_id", woId)
      .order("work_date", { ascending: false }),
    supabase.from("files")
      .select("file_name, file_type, receive_date, delivery_date, technicians(name)")
      .eq("wo_id", woId),
    supabase.from("purchases")
      .select("item_name, qty, request_date, supply_date, status, image_path")
      .eq("wo_id", woId),
    supabase.from("wo_production_items").select("*").eq("work_order_id", woId).order("id", { ascending: true }),
    // RLS بتفلتر تلقائي: كل قسم يشوف بنوده هو بس، والمدير يشوف الكل
    supabase.from("wo_bom_items").select("*").eq("work_order_id", woId).order("s_no", { ascending: true, nullsFirst: false }),
    supabase.from("wo_department_status").select("department, status, applicable").eq("wo_id", woId),
    supabase.from("departments").select("code, aliases").eq("active", true),
  ]);

  // تحويل قسم المستخدم (بالقيمة القديمة) للـ code الثابت
  const myDeptCode = (departmentRows ?? []).find((d: any) =>
    (d.aliases ?? []).some((a: string) => a.trim().toLowerCase() === (department ?? "").trim().toLowerCase())
  )?.code ?? null;

  if (!wo) notFound();

  return (
    <AppShell role={role}>
      <WODetailClient
        wo={wo}
        productivity={(productivity ?? []).map((p: any) => ({ ...p, tech_name: p.technicians?.name }))}
        files={(files ?? []).map((f: any) => ({ ...f, supervisor_name: f.technicians?.name }))}
        purchases={purchases ?? []}
        initialProdItems={prodItems ?? []}
        initialBomItems={bomItems ?? []}
        deptStatus={(deptRows ?? []) as any[]}
        myDeptCode={myDeptCode}
        role={role}
        department={department}
      />
    </AppShell>
  );
}
