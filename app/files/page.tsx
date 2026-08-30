import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import FilesClient from "./FilesClient";
export const dynamic = "force-dynamic";

export default async function FilesPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).single();
  const role = appUser?.role ?? "secretary";

  const [{ data: files }, { data: wos }, { data: supervisors }] = await Promise.all([
    supabase.from("files").select(`
      *,
      work_order:work_orders(wo_number),
      supervisor:technicians(name)
    `).order("id", { ascending: false }),
    supabase.from("work_orders").select("id, wo_number").order("id", { ascending: false }),
    supabase.from("technicians").select("id, name").eq("grade", "مشرف").order("name"),
  ]);

  return (
    <AppShell role={role}>
      <FilesClient
        initialFiles={files ?? []}
        wos={wos ?? []}
        supervisors={supervisors ?? []}
        role={role}
      />
    </AppShell>
  );
}
