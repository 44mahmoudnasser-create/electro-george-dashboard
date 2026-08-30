import { createSupabaseServerClient } from "./supabase-server";

/**
 * Get the current user's role from auth metadata.
 * Falls back to "admin" if no role set (so the first user always has access).
 * Role is set via: Supabase Dashboard → Authentication → Users → Edit user metadata
 * OR via SQL: UPDATE auth.users SET raw_user_meta_data = '{"role":"admin"}' WHERE email='...'
 */
export async function getUserRole(): Promise<{ user: any; role: string }> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { user: null, role: "secretary" };

  // Read from user metadata (set via Supabase dashboard or SQL)
  const metaRole = user.user_metadata?.role as string | undefined;

  // Also try app_users table as backup
  let dbRole: string | undefined;
  try {
    const { data } = await supabase
      .from("app_users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    dbRole = data?.role;
  } catch {}

  // Priority: metadata > db > default to "admin" (fail open for first user)
  const role = metaRole ?? dbRole ?? "admin";

  return { user, role };
}
