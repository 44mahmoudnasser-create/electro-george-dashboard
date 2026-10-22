import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect, notFound } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import TotalBomClient from "./TotalBomClient";
export const dynamic = "force-dynamic";

export default async function TotalBomPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { user, role, department } = await getUserRole();
  if (!user) redirect("/login");

  const woId = parseInt(params.id);
  if (isNaN(woId)) notFound();

  const [{ data: wo }, { data: rows }, { data: deptRows }] = await Promise.all([
    supabase.from("work_orders").select("id, wo_number, client_name, project_name").eq("id", woId).maybeSingle(),
    supabase.from("wo_total_bom").select("*").eq("wo_id", woId).order("s_no", { ascending: true, nullsFirst: false }),
    supabase.from("departments").select("code, aliases").eq("active", true),
  ]);
  if (!wo) notFound();

  const raw = (department ?? "").trim().toLowerCase();
  const myCode = (deptRows ?? []).find((d: any) =>
    (d.aliases ?? []).some((a: string) => a.trim().toLowerCase() === raw))?.code ?? null;
  const canWrite = role === "manager" || myCode === "DESIGN";

  return (
    <AppShell role={role}>
      <TotalBomClient
        wo={wo as any}
        initialRows={(rows ?? []) as any[]}
        canWrite={canWrite}
      />
    </AppShell>
  );
}
