import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import PurchasesClient from "./PurchasesClient";
export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: appUser } = await supabase.from("app_users").select("role, department").eq("id", user.id).single();
  const role = appUser?.role ?? "secretary";
  const department = appUser?.department ?? null;
  const [{ data: orders }, { data: wos }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("*, work_order:work_orders(wo_number), purchase_items(*), images:purchase_order_images(id, image_path)")
      .order("id", { ascending: false }),
    supabase.from("work_orders").select("id,wo_number").order("id", { ascending: false }),
  ]);
  return (
    <AppShell role={role}>
      <PurchasesClient initialOrders={orders ?? []} wos={wos ?? []} role={role} department={department} userId={user.id} />
    </AppShell>
  );
}
