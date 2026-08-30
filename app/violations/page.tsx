import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import ViolationsClient from "./ViolationsClient";
export const dynamic = "force-dynamic";

export default async function ViolationsPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).single();
  const role = appUser?.role ?? "secretary";

  const [{ data: violations }, { data: technicians }] = await Promise.all([
    supabase.from("violations")
      .select("*, technician:technicians(id, name)")
      .order("date", { ascending: false }),
    supabase.from("technicians").select("id, name").order("name"),
  ]);

  return (
    <AppShell role={role}>
      <ViolationsClient initialViolations={violations ?? []} technicians={technicians ?? []} role={role} />
    </AppShell>
  );
}
