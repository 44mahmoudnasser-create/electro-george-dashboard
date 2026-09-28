import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import webpush from "web-push";
import nodemailer from "nodemailer";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, body, url } = await request.json();
  const debug: Record<string, unknown> = {};

  const { data: sender } = await supabaseAdmin
    .from("app_users")
    .select("full_name, email, department")
    .eq("id", user.id)
    .maybeSingle();

  const { data: candidates, error: candErr } = await supabaseAdmin
    .from("app_users")
    .select("id, email, notify_email, role, department")
    .in("role", ["manager", "admin"]);
  if (candErr) debug.candidatesError = candErr.message;

  const recipients = (candidates ?? []).filter(r =>
    r.id !== user.id &&
    (r.role === "manager" || (sender?.department && r.department === sender.department))
  );
  debug.candidates = candidates?.length ?? 0;
  debug.recipients = recipients.length;
  debug.senderRole = user.id;

  if (recipients.length === 0) return NextResponse.json({ push: 0, email: 0, debug });

  // ---------- Push ----------
  let pushSent = 0;
  const { data: subs, error: subsErr } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", recipients.map(r => r.id));
  if (subsErr) debug.subsError = subsErr.message;
  debug.subscriptions = subs?.length ?? 0;

  const pushResults = await Promise.allSettled(
    (subs ?? []).map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url })
      )
    )
  );
  const pushErrors: unknown[] = [];
  for (let i = 0; i < pushResults.length; i++) {
    const r = pushResults[i];
    if (r.status === "fulfilled") pushSent++;
    else {
      const code = (r.reason as any)?.statusCode;
      pushErrors.push(code ?? String(r.reason));
      if ([404, 410].includes(code)) {
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", subs![i].id);
      }
    }
  }
  if (pushErrors.length) debug.pushErrors = pushErrors;

  // ---------- Email ----------
  let emailSent = 0;
  const emails = recipients.map(r => r.notify_email || r.email).filter(Boolean) as string[];
  debug.emailTargets = emails;

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    debug.emailError = "GMAIL_USER / GMAIL_APP_PASSWORD مش موجودين في Vercel";
  } else if (emails.length) {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      });
      const link = new URL(url || "/", request.url).toString();
      const who = sender?.full_name || sender?.email || "";

      await transporter.sendMail({
        from: `"Electro George" <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER,
        bcc: emails,
        subject: title,
        text: `${body}\n${who ? `بواسطة: ${who}\n` : ""}${link}`,
        html: `
          <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">
            <h2 style="margin:0 0 8px">${esc(title)}</h2>
            <p style="margin:0 0 4px">${esc(body)}</p>
            ${who ? `<p style="margin:0 0 12px;color:#666">بواسطة: ${esc(who)}</p>` : ""}
            <a href="${link}" style="background:#10b981;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none">فتح النظام</a>
          </div>`,
      });
      emailSent = emails.length;
    } catch (err: any) {
      debug.emailError = err?.message ?? String(err);
      console.error("Email failed:", err);
    }
  }

  return NextResponse.json({ push: pushSent, email: emailSent, debug });
}
