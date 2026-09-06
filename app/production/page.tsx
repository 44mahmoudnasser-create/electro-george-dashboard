import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserRole } from "@/lib/get-role";
import { redirect } from "next/navigation";
import ProductionOnlyClient from "./ProductionOnlyClient";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["sheet_worker", "paint_worker"] as const;

export default async function ProductionOnlyPage() {
  const supabase = createSupabaseServerClient();
  const { user, role } = await getUserRole();
  if (!user) redirect("/login");

  // أي حد مش من الدورين دول ملوش حق يدخل هنا، يترجع لتطبيقه العادي
  if (!ALLOWED_ROLES.includes(role as any)) redirect("/dashboard"); // 👈 غيّر المسار ده لو صفحة الدخول الرئيسية عندك اسمها مختلف

  const { data: wos } = await supabase
    .from("work_orders")
    .select("id, wo_number")
    .order("id", { ascending: false });

  return <ProductionOnlyClient wos={wos ?? []} role={role as "sheet_worker" | "paint_worker"} />;
}
