import { createSupabaseServerClient } from "./supabase-server";

/**
 * Get the current user's role from app_users table (مصدر الحقيقة الوحيد).
 * Falls back to "admin" if no row found (so the first user always has access).
 */
export async function getUserRole(): Promise<{ user: any; role: string }> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { user: null, role: "secretary" };

  let dbRole: string | undefined;
  try {
    const { data } = await supabase
      .from("app_users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    dbRole = data?.role;
  } catch {}

  // Priority: db (مصدر الحقيقة الوحيد) > fallback to "admin" لو مفيش صف خالص
  const role = dbRole ?? "admin";

  return { user, role };
}
