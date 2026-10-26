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
    { data: itemRows },
    { data: totalBomRows },
  ] = await Promise.all([
    supabase.from("work_orders").select("*").eq("id", woId).single(),
    supabase.from("daily_productivity")
      .select("work_date, task, notes, technicians(name)")
      .eq("wo_id", woId)
      .order("work_date", { ascending: false }),
    supabase.from("files")
      .select("file_name, file_type, receive_date, delivery_date, technicians(name), file_items(item:work_order_items(item_no, description))")
      .eq("wo_id", woId),
    supabase.from("purchases")
      .select("item_name, qty, request_date, supply_date, status, image_path")
      .eq("wo_id", woId),
    supabase.from("wo_production_items").select("*").eq("work_order_id", woId).order("id", { ascending: true }),
    // RLS بتفلتر تلقائي: كل قسم يشوف بنوده هو بس، والمدير يشوف الكل
    supabase.from("wo_bom_items").select("*").eq("work_order_id", woId).order("s_no", { ascending: true, nullsFirst: false }),
    supabase.from("wo_department_status").select("item_id, department, status").eq("wo_id", woId),
    supabase.from("departments").select("code, aliases").eq("active", true),
    supabase.from("work_order_items").select("*").eq("wo_id", woId).order("item_no", { ascending: true }),
    supabase.from("wo_total_bom").select("*").eq("wo_id", woId).order("s_no", { ascending: true, nullsFirst: false }),
  ]);

  // تحويل قسم المستخدم (بالقيمة القديمة) للـ code الثابت
  const { data: me } = await supabase.from("app_users").select("full_name, email").eq("id", user.id).maybeSingle();
  const currentUserName = me?.full_name || me?.email || "";

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
        currentUserName={currentUserName}
        currentUserEmail={me?.email ?? user.email ?? ""}
        initialItems={(itemRows ?? []) as any[]}
        initialTotalBom={(totalBomRows ?? []) as any[]}
        isDesign={myDeptCode === "DESIGN"}
        departmentAliases={(departmentRows ?? []) as any[]}
        role={role}
        department={department}
      />
    </AppShell>
  );
}
