import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import ProductivityClient from "./ProductivityClient";
export const dynamic = "force-dynamic";

export default async function ProductivityPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).single();
  const role = appUser?.role ?? "secretary";

  const [{ data: records }, { data: technicians }, { data: wos }] = await Promise.all([
    supabase.from("daily_productivity")
      .select("*, technician:technicians(id,name), work_order:work_orders(id,wo_number)")
      .order("work_date", { ascending: false })
      .limit(100),
    supabase.from("technicians").select("id, name").order("name"),
    supabase.from("work_orders").select("id, wo_number").order("id", { ascending: false }),
  ]);

  return (
    <AppShell role={role}>
      <ProductivityClient
        initialRecords={records ?? []}
        technicians={technicians ?? []}
        wos={wos ?? []}
        role={role}
      />
    </AppShell>
  );
}
