import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// service role عشان يقدر يقرا كل الاشتراكات بغض النظر عن RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const { title, body, url } = await request.json();

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, user_id, app_users!inner(role)")
    .in("app_users.role", ["manager", "admin"]);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        JSON.stringify({ title, body, url })
      );
      sent++;
    } catch (err: any) {
      // لو الاشتراك بقى expired أو invalid، امسحه
      if (err.statusCode === 404 || err.statusCode === 410) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }

  return NextResponse.json({ sent });
}