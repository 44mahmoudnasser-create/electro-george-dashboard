import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import WorkOrdersClient from "./WorkOrdersClient";
export const dynamic = "force-dynamic";

export default async function WorkOrdersPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).single();
  const role = appUser?.role ?? "secretary";
  const { data: wos } = await supabase.from("work_orders").select("*").order("id", { ascending: false });
  return (
    <AppShell role={role}>
      <WorkOrdersClient initialWOs={wos ?? []} role={role} />
    </AppShell>
  );
}
