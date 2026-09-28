import { createSupabaseServerClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import ProductionOnlyClient from "./ProductionOnlyClient";
export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("department")
    .eq("id", user.id)
    .single();

  const { data: wos } = await supabase
    .from("work_orders")
    .select("id, wo_number")
    .order("id", { ascending: false });

  return (
    <ProductionOnlyClient
      wos={wos ?? []}
      department={appUser?.department ?? null}
    />
  );
}
