import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import StandardClient from "./StandardClient";
export const dynamic = "force-dynamic";

export default async function StandardProductsPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).single();
  const role = appUser?.role ?? "secretary";

  const { data: products } = await supabase
    .from("standard_products")
    .select("*, production_items(*), bom_items(*)")
    .order("id", { ascending: false });

  return (
    <AppShell role={role}>
      <StandardClient initialProducts={products ?? []} role={role} />
    </AppShell>
  );
}
