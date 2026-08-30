import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect, notFound } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import TechDetailClient from "./TechDetailClient";
export const dynamic = "force-dynamic";

export default async function TechDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { user, role } = await getUserRole();
  if (!user) redirect("/login");

  const techId = parseInt(params.id);
  if (isNaN(techId)) notFound();

  const [
    { data: tech },
    { data: allSkills },
    { data: techSkills },
    { data: attendance },
    { data: permissions },
    { data: overtime },
    { data: violations },
    { data: productivity },
    { data: filesReceived },
  ] = await Promise.all([
    supabase.from("technicians").select("*").eq("id", techId).single(),
    supabase.from("skills").select("*").order("skill_name"),
    supabase.from("tech_skills").select("skill_id, skills(skill_name)").eq("tech_id", techId),
    supabase.from("attendance").select("date,status").eq("tech_id", techId).order("date", { ascending: false }).limit(15),
    supabase.from("permissions").select("date,permission_type").eq("tech_id", techId).order("date", { ascending: false }).limit(15),
    supabase.from("overtime").select("date").eq("tech_id", techId).eq("has_overtime", true).order("date", { ascending: false }).limit(15),
    supabase.from("violations").select("date,reason,details").eq("tech_id", techId).order("date", { ascending: false }),
    supabase.from("daily_productivity").select("work_date,task,notes,work_orders(wo_number)").eq("tech_id", techId).order("work_date", { ascending: false }).limit(20),
    supabase.from("files").select("file_name,file_type,delivery_date,work_orders(wo_number)").eq("delivered_to", techId).order("delivery_date", { ascending: false }),
  ]);

  if (!tech) notFound();

  return (
    <AppShell role={role}>
      <TechDetailClient
        tech={tech}
        allSkills={allSkills ?? []}
        techSkills={(techSkills ?? []).map((ts: any) => ({ skill_id: ts.skill_id, skill_name: ts.skills?.skill_name }))}
        attendance={attendance ?? []}
        permissions={permissions ?? []}
        overtime={overtime ?? []}
        violations={violations ?? []}
        productivity={(productivity ?? []).map((p: any) => ({ ...p, wo_number: p.work_orders?.wo_number }))}
        filesReceived={(filesReceived ?? []).map((f: any) => ({ ...f, wo_number: f.work_orders?.wo_number }))}
        role={role}
      />
    </AppShell>
  );
}
