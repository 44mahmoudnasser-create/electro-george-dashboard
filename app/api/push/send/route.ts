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

// service role: بيقرا كل الاشتراكات والإيميلات بغض النظر عن RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const unique = (arr: string[]) => arr.filter((v, i) => arr.indexOf(v) === i);

export async function POST(request: Request) {
  // لازم يكون مسجل دخول، وإلا أي حد يقدر يبعت spam
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, body, url } = await request.json();

  // مين اللي سجّل؟ (نجيب قسمه واسمه)
  const { data: sender } = await supabaseAdmin
    .from("app_users")
    .select("full_name, email, department")
    .eq("id", user.id)
    .maybeSingle();

  const { data: candidates, error: candErr } = await supabaseAdmin
    .from("app_users")
    .select("id, email, notify_email, role, department")
    .in("role", ["manager", "admin"]);
  if (candErr) console.error("Candidates query failed:", candErr.message);

  const senderDept = (sender?.department ?? "").toLowerCase();

  // TO: أدمنز نفس قسم اللي سجّل (من غيره هو)
  const toUsers = (candidates ?? []).filter(r =>
    r.role === "admin" &&
    r.id !== user.id &&
    senderDept !== "" &&
    (r.department ?? "").toLowerCase() === senderDept
  );

  // CC: المديرين (من غير اللي سجّل لو هو نفسه مدير)
  const ccUsers = (candidates ?? []).filter(r =>
    r.role === "manager" && r.id !== user.id
  );

  const recipients = [...toUsers, ...ccUsers];
  if (recipients.length === 0) return NextResponse.json({ push: 0, email: 0 });

  // ---------- 1) Push (لنفس المجموعتين) ----------
  let pushSent = 0;
  const { data: subs, error: subsErr } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", recipients.map(r => r.id));
  if (subsErr) console.error("Subscriptions query failed:", subsErr.message);

  const pushResults = await Promise.allSettled(
    (subs ?? []).map(s =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, url })
      )
    )
  );
  for (let i = 0; i < pushResults.length; i++) {
    const r = pushResults[i];
    if (r.status === "fulfilled") pushSent++;
    else {
      const code = (r.reason as any)?.statusCode;
      if ([404, 410].includes(code)) {
        // الاشتراك انتهى أو اتلغى، امسحه
        await supabaseAdmin.from("push_subscriptions").delete().eq("id", subs![i].id);
      } else {
        console.error("Push failed:", code ?? r.reason);
      }
    }
  }

  // ---------- 2) Email ----------
  let emailSent = 0;
  const toEmails = unique(
    toUsers.map(r => r.notify_email || r.email).filter(Boolean) as string[]
  );
  const ccEmails = unique(
    ccUsers.map(r => r.notify_email || r.email).filter(Boolean) as string[]
  ).filter(e => !toEmails.includes(e));

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error("GMAIL_USER / GMAIL_APP_PASSWORD مش موجودين في Vercel");
  } else if (toEmails.length || ccEmails.length) {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      });
      const link = new URL(url || "/", request.url).toString();
      const who = sender?.full_name || sender?.email || "";

      // لو مفيش أدمنز في القسم، المديرين ياخدوا مكان الـ To
      const to = toEmails.length ? toEmails : ccEmails;
      const cc = toEmails.length ? ccEmails : [];

      await transporter.sendMail({
        from: `"Electro George" <${process.env.GMAIL_USER}>`,
        to,
        ...(cc.length ? { cc } : {}),
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
      emailSent = to.length + cc.length;
    } catch (err) {
      console.error("Email failed:", err); // لو الإيميل فشل، الـ push فضل شغال
    }
  }

  return NextResponse.json({ push: pushSent, email: emailSent });
}
