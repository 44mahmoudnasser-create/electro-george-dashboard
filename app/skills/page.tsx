import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import SkillsClient from "./SkillsClient";
export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).single();
  const role = appUser?.role ?? "secretary";

  const { data: skills } = await supabase.from("skills").select(`
    id, skill_name,
    tech_skills ( tech_id, technicians ( id, name, grade ) )
  `).order("skill_name");

  return (
    <AppShell role={role}>
      <SkillsClient initialSkills={skills ?? []} role={role} />
    </AppShell>
  );
}
