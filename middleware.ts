import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const RESTRICTED_ROLES = ["sheet_worker", "paint_worker"];
const RESTRICTED_HOME = "/production";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cs: any[]) {
          cs.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cs.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
  
  // 1. التعديل هنا: استخدام getSession السريعة التي تقرأ من الـ Cookies
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  
  const { pathname } = request.nextUrl;
  
  if (!user && pathname !== "/login") return NextResponse.redirect(new URL("/login", request.url));

  if (user) {
    // فني الصاج/الدهان: نجيب الدور بتاعه ونقفل عليه شاشة /production بس
    const { data: appUser } = await supabase.from("app_users").select("role").eq("id", user.id).single();
    const role = appUser?.role;
    const isRestricted = !!role && RESTRICTED_ROLES.includes(role);

    if (isRestricted && !pathname.startsWith(RESTRICTED_HOME)) {
      return NextResponse.redirect(new URL(RESTRICTED_HOME, request.url));
    }
    if (!isRestricted && pathname === "/login") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (!isRestricted && pathname.startsWith(RESTRICTED_HOME)) {
      // اختياري: منع باقي الأدوار من دخول شاشة العمال المقيدين
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }
  
  return response;
}

export const config = {
  // 2. التعديل هنا: استثناء الـ /api ومفاتيح أخرى لتخفيف الضغط على الـ Middleware
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/.*).*)"],
};