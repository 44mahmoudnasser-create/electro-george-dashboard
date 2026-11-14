import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { deptLabel } from "@/lib/roles";

// ملخص الحضور اليومي: إيميل واحد بس الساعة 4 العصر بتوقيت القاهرة
// بيتشغل من Vercel Cron (vercel.json)، وبيتأكد من الساعة قبل ما يبعت

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// التاريخ والساعة في القاهرة (بيتعامل مع التوقيت الصيفي تلقائي)
function cairoNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export async function GET(request: Request) {
  // Vercel Cron بيبعت Authorization: Bearer <CRON_SECRET>
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { date, hour } = cairoNow();
  const force = new URL(request.url).searchParams.get("force") === "1";
  // الكرون مرة واحدة 14:00 UTC = 4 العصر في الشتا و5 في الصيف (التوقيت الصيفي)، فبنقبل الساعتين للكرون بتاع Vercel بس
  const fromVercelCron = (request.headers.get("user-agent") ?? "").startsWith("vercel-cron");
  if (hour !== 16 && !(fromVercelCron && hour === 17) && !force) {
    return NextResponse.json({ skipped: true, reason: `Cairo hour is ${hour}` });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const [tRes, aRes, gRes, mRes, uRes] = await Promise.all([
    admin.from("technicians").select("id, name, department"),
    admin.from("attendance").select("tech_id, status").eq("date", date),
    admin.from("department_groups").select("id, name, department, supervisor_id"),
    admin.from("department_group_members").select("group_id, tech_id"),
    admin.from("app_users").select("email, notify_email").eq("role", "manager"),
  ]);

  // لو أي استعلام فشل، ما نبعتش إيميل بأرقام غلط: نرجع الخطأ بالتفصيل
  const failed = [
    ["technicians", tRes.error], ["attendance", aRes.error], ["department_groups", gRes.error],
    ["department_group_members", mRes.error], ["app_users", uRes.error],
  ].filter(([, e]) => e) as [string, { message: string }][];
  if (failed.length) {
    return NextResponse.json({ error: "query failed", failed: failed.map(([t, e]) => `${t}: ${e.message}`) }, { status: 500 });
  }
  const techs = tRes.data, att = aRes.data, groups = gRes.data, members = mRes.data, managers = uRes.data;

  const statusOf = new Map((att ?? []).map(a => [a.tech_id, a.status]));
  // نفس ترتيب صفحة الحضور: المشرف الأول، والأعضاء بعدهم (والعضوية بتكسب لو اتكررت)
  const groupOf = new Map<number, number>();
  (groups ?? []).forEach(g => { if (g.supervisor_id && !groupOf.has(g.supervisor_id)) groupOf.set(g.supervisor_id, g.id); });
  (members ?? []).forEach(m => groupOf.set(m.tech_id, m.group_id));
  const groupById = new Map((groups ?? []).map(g => [g.id, g]));
  const nameOf = new Map((techs ?? []).map(t => [t.id, t.name]));

  // تجميع: قسم ← مجموعة (أو بدون مجموعة)
  type Counts = { total: number; present: number; absent: number; leave: number; mission: number; unrecorded: number; absentNames: string[] };
  const empty = (): Counts => ({ total: 0, present: 0, absent: 0, leave: 0, mission: 0, unrecorded: 0, absentNames: [] });
  const sections = new Map<string, { dept: string; title: string; c: Counts }>();
  (techs ?? []).forEach(t => {
    const dept = t.department || "بدون قسم";
    const gid = groupOf.get(t.id);
    const g = gid !== undefined ? groupById.get(gid) : undefined;
    const key = `${dept}|${g ? g.id : "none"}`;
    if (!sections.has(key)) sections.set(key, { dept, title: g ? g.name : "بدون مجموعة", c: empty() });
    const c = sections.get(key)!.c;
    const st = statusOf.get(t.id);
    c.total++;
    if (st === "حاضر") c.present++;
    else if (st === "غياب") { c.absent++; c.absentNames.push(t.name); }
    else if (st === "أجازة") c.leave++;
    else if (st === "مأمورية") c.mission++;
    else c.unrecorded++;
  });

  const totals = empty();
  sections.forEach(s => {
    totals.total += s.c.total; totals.present += s.c.present; totals.absent += s.c.absent;
    totals.leave += s.c.leave; totals.mission += s.c.mission; totals.unrecorded += s.c.unrecorded;
  });

  const rowsHtml = Array.from(sections.values())
    .sort((a, b) => deptLabel(a.dept).localeCompare(deptLabel(b.dept), "ar") || a.title.localeCompare(b.title, "ar"))
    .map(s => `
      <tr>
        <td style="padding:6px 10px;border:1px solid #e5e7eb">${esc(deptLabel(s.dept))} · ${esc(s.title)}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${s.c.total}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center;color:#059669">${s.c.present}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center;color:#dc2626">${s.c.absent}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${s.c.leave}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${s.c.mission}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${s.c.unrecorded}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb">${s.c.absentNames.map(esc).join("، ") || "—"}</td>
      </tr>`).join("") + `
      <tr style="background:#f3f4f6;font-weight:bold">
        <td style="padding:6px 10px;border:1px solid #e5e7eb">الإجمالي</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${totals.total}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${totals.present}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${totals.absent}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${totals.leave}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${totals.mission}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center">${totals.unrecorded}</td>
        <td style="padding:6px 10px;border:1px solid #e5e7eb"></td>
      </tr>`;

  // تأكيد: كل عضو في مجموعة لازم المجموعة تكون موجودة في القائمة (وإلا هيتحسب "بدون مجموعة" غلط)
  const orphanMembers = (members ?? []).filter(m => !groupById.has(m.group_id)).length;
  if (orphanMembers > 0) {
    return NextResponse.json({ error: "members point to groups that were not loaded", orphanMembers }, { status: 500 });
  }

  const to = unique((managers ?? []).map(m => m.notify_email || m.email).filter(Boolean) as string[]);
  if (to.length === 0) return NextResponse.json({ sent: 0, reason: "no managers with email" });
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ error: "GMAIL_USER / GMAIL_APP_PASSWORD مش موجودين" }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  const link = new URL("/attendance", request.url).toString();
  const subject = `ملخص الحضور — ${date}`;

  await transporter.sendMail({
    from: `"Electro George Factory" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    text: `${subject}\nحاضر: ${totals.present} · غياب: ${totals.absent} · إجازة: ${totals.leave} · مأمورية: ${totals.mission} · لم يُسجل: ${totals.unrecorded}\n${link}`,
    html: `
      <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">
        <h2 style="margin:0 0 8px">${esc(subject)}</h2>
        <p style="margin:0 0 12px">حاضر <b>${totals.present}</b> · غياب <b>${totals.absent}</b> · إجازة <b>${totals.leave}</b> · مأمورية <b>${totals.mission}</b> · لم يُسجل <b>${totals.unrecorded}</b></p>
        <table style="border-collapse:collapse;font-size:13px">
          <tr style="background:#f3f4f6">
            <th style="padding:6px 10px;border:1px solid #e5e7eb">القسم · المجموعة</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb">الإجمالي</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb">حاضر</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb">غياب</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb">إجازة</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb">مأمورية</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb">لم يُسجل</th>
            <th style="padding:6px 10px;border:1px solid #e5e7eb">الغائبين</th>
          </tr>
          ${rowsHtml}
        </table>
        <p style="margin:12px 0"><a href="${link}" style="background:#10b981;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none">فتح صفحة الحضور</a></p>
      </div>`,
  });

  return NextResponse.json({ sent: to.length, date });
}

function unique(arr: string[]) {
  return arr.filter((v, i) => arr.indexOf(v) === i);
}
