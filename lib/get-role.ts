import { createSupabaseServerClient } from "./supabase-server";

export async function getUserRole(): Promise<{ user: any; role: string; department: string | null }> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, role: "secretary", department: null };

  const { data } = await supabase
    .from("app_users")
    .select("role, department")
    .eq("id", user.id)
    .maybeSingle();

  return { user, role: data?.role ?? "admin", department: data?.department ?? null };
}
