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
  const [{ data: wos }, { data: products }] = await Promise.all([
    supabase.from("work_orders").select("*").order("id", { ascending: false }),
    supabase.from("standard_products").select("id,name").order("name", { ascending: true }),
  ]);
  return (
    <AppShell role={role}>
      <WorkOrdersClient initialWOs={wos ?? []} products={products ?? []} role={role} />
    </AppShell>
  );
}
