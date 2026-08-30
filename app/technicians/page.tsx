import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import TechniciansClient from "./TechniciansClient";
export const dynamic = "force-dynamic";

export default async function TechniciansPage() {
  const supabase = createSupabaseServerClient();
  const { user, role } = await getUserRole();
  if (!user) redirect("/login");

  const [{ data: technicians }, { data: skills }] = await Promise.all([
    supabase.from("technicians").select(`
      *,
      tech_skills ( skill_id, skills ( skill_name ) )
    `).order("name"),
    supabase.from("skills").select("*").order("skill_name"),
  ]);

  return (
    <AppShell role={role}>
      <TechniciansClient
        initialTechnicians={technicians ?? []}
        allSkills={skills ?? []}
        role={role}
      />
    </AppShell>
  );
}
