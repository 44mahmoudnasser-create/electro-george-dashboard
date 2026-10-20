import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect, notFound } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import TechDetailClient from "./TechDetailClient";
export const dynamic = "force-dynamic";

// Supabase بيرجع 1000 صف كحد أقصى للطلب، فنقرا على دفعات لحد ما نخلص كل السجلات
async function fetchAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export default async function TechDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const { user, role } = await getUserRole();
  if (!user) redirect("/login");

  const techId = parseInt(params.id);
  if (isNaN(techId)) notFound();

  const { data: tech } = await supabase.from("technicians").select("*").eq("id", techId).single();
  if (!tech) notFound();

  const [allSkills, techSkills, attendance, permissions, overtime, violations, productivity, filesReceived] =
    await Promise.all([
      supabase.from("skills").select("*").order("skill_name").then(r => r.data ?? []),
      supabase.from("tech_skills").select("skill_id, skills(skill_name)").eq("tech_id", techId).then(r => r.data ?? []),
      fetchAll<{ date: string; status: string }>((a, b) =>
        supabase.from("attendance").select("date,status").eq("tech_id", techId)
          .order("date", { ascending: false }).range(a, b)),
      fetchAll<{ date: string; permission_type: string }>((a, b) =>
        supabase.from("permissions").select("date,permission_type").eq("tech_id", techId)
          .order("date", { ascending: false }).range(a, b)),
      fetchAll<{ date: string; has_overtime: boolean }>((a, b) =>
        supabase.from("overtime").select("date,has_overtime").eq("tech_id", techId)
          .eq("has_overtime", true).order("date", { ascending: false }).range(a, b)),
      fetchAll<{ date: string; reason: string; details: string }>((a, b) =>
        supabase.from("violations").select("date,reason,details").eq("tech_id", techId)
          .order("date", { ascending: false }).range(a, b)),
      fetchAll<any>((a, b) =>
        supabase.from("daily_productivity").select("work_date,task,notes,work_orders(wo_number)")
          .eq("tech_id", techId).order("work_date", { ascending: false }).range(a, b)),
      fetchAll<any>((a, b) =>
        supabase.from("files").select("file_name,file_type,delivery_date,work_orders(wo_number)")
          .eq("delivered_to", techId).order("delivery_date", { ascending: false }).range(a, b)),
    ]);

  const [custody, tools, availableItems] = await Promise.all([
    supabase.from("custody")
      .select("id, tool_id, tool_item_id, qty, open_qty, status, issued_at, note, tools(name,is_consumable,unit), tool_items(serial_no), custody_events(event,qty,note,created_at)")
      .eq("tech_id", techId).order("id", { ascending: false }).then(r => r.data ?? []),
    supabase.from("tools").select("id,name,is_consumable,unit,department").eq("active", true).order("name").then(r => r.data ?? []),
    supabase.from("tool_items").select("id,tool_id,serial_no,status").eq("status", "متاح").order("serial_no").then(r => r.data ?? []),
  ]);

  return (
    <AppShell role={role}>
      <TechDetailClient
        custody={custody as any[]}
        tools={tools as any[]}
        availableItems={availableItems as any[]}
        tech={tech}
        allSkills={allSkills as any[]}
        techSkills={(techSkills as any[]).map(ts => ({ skill_id: ts.skill_id, skill_name: ts.skills?.skill_name }))}
        attendance={attendance}
        permissions={permissions}
        overtime={overtime}
        violations={violations}
        productivity={productivity.map((p: any) => ({ ...p, wo_number: p.work_orders?.wo_number }))}
        filesReceived={filesReceived.map((f: any) => ({ ...f, wo_number: f.work_orders?.wo_number }))}
        role={role}
      />
    </AppShell>
  );
}
