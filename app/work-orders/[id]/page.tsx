import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect, notFound } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import WODetailClient from "./WODetailClient";
export const dynamic = "force-dynamic";

export default async function WODetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { user, role } = await getUserRole();
  if (!user) redirect("/login");

  const woId = parseInt(params.id);
  if (isNaN(woId)) notFound();

  const [
    { data: wo },
    { data: productivity },
    { data: files },
    { data: purchases },
    { data: products },
    { data: woProducts },
  ] = await Promise.all([
    supabase.from("work_orders").select("*").eq("id", woId).single(),
    supabase.from("daily_productivity")
      .select("work_date, task, notes, technicians(name)")
      .eq("wo_id", woId)
      .order("work_date", { ascending: false }),
    supabase.from("files")
      .select("file_name, file_type, receive_date, delivery_date, technicians(name)")
      .eq("wo_id", woId),
    supabase.from("purchases")
      .select("item_name, qty, request_date, supply_date, status, image_path")
      .eq("wo_id", woId),
    supabase.from("standard_products").select("id,name").order("name", { ascending: true }),
    supabase.from("work_order_products")
      .select("id, quantity, standard_product:standard_products(id,name)")
      .eq("work_order_id", woId),
  ]);

  if (!wo) notFound();

  return (
    <AppShell role={role}>
      <WODetailClient
        wo={wo}
        productivity={(productivity ?? []).map((p: any) => ({ ...p, tech_name: p.technicians?.name }))}
        files={(files ?? []).map((f: any) => ({ ...f, supervisor_name: f.technicians?.name }))}
        purchases={purchases ?? []}
        products={products ?? []}
        initialWoProducts={woProducts ?? []}
        role={role}
      />
    </AppShell>
  );
}
