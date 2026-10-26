import { createSupabaseServerClient } from "./supabase-server";

export type ShellUserData = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  department: string | null;
};

// بيانات المستخدم اللي بتظهر في القائمة الجانبية (بتتجاب مرة واحدة في app/layout.tsx).
// لو حصل أي خطأ بنرجّع null والقائمة بتجيب البيانات من المتصفح.
export async function getShellUser(): Promise<ShellUserData | null> {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("app_users")
      .select("role, full_name, email, department")
      .eq("id", user.id)
      .maybeSingle();
    const metaRole = user.user_metadata?.role as string | undefined;
    return {
      id: user.id,
      name: data?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
      email: data?.email ?? user.email ?? null,
      role: data?.role ?? metaRole ?? "admin",
      department: data?.department ?? null,
    };
  } catch {
    return null;
  }
}
