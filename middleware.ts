import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  if (user && pathname === "/login") return NextResponse.redirect(new URL("/dashboard", request.url));
  
  return response;
}

export const config = {
  // 2. التعديل هنا: استثناء الـ /api ومفاتيح أخرى لتخفيف الضغط على الـ Middleware
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/.*).*)"],
};