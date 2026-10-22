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
  const { data: appUser } = await supabase.from("app_users").select("role, department").eq("id", user.id).single();
  const role = appUser?.role ?? "secretary";
  // مكتب التصميم بينشئ أوامر الشغل زي المدير
  const { data: deptRows } = await supabase.from("departments").select("code, aliases").eq("active", true);
  const raw = (appUser?.department ?? "").trim().toLowerCase();
  const myCode = (deptRows ?? []).find((d: any) =>
    (d.aliases ?? []).some((a: string) => a.trim().toLowerCase() === raw))?.code ?? null;
  const canCreate = role === "manager" || myCode === "DESIGN";
  const { data: wos } = await supabase.from("work_orders").select("*").order("id", { ascending: false });
  return (
    <AppShell role={role}>
      <WorkOrdersClient initialWOs={wos ?? []} role={role} canCreate={canCreate} isDesign={myCode === "DESIGN"} />
    </AppShell>
  );
}
