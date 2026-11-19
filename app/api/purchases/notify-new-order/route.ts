import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import nodemailer from "nodemailer";

// إيميل بيتبعت لما يتضاف أمر شراء جديد: للمدير + قسم supmanager + اللي أنشأ الأمر
const NOTIFY_DEPT = "supmanager";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unique = (arr: string[]) => arr.filter((v, i) => arr.indexOf(v) === i);

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { orderId } = await request.json().catch(() => ({}));
  if (!orderId) return NextResponse.json({ error: "missing orderId" }, { status: 400 });

  // بنقرا الأمر بصلاحيات المستخدم (RLS): لو مش شايفه مش هيتبعت
  const { data: order } = await supabase
    .from("purchase_orders")
    .select("id, order_no, request_date, status, created_by, work_order:work_orders(wo_number), purchase_items(item_name, quantity, category, expected_supply_date)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error("GMAIL_USER / GMAIL_APP_PASSWORD مش موجودين في Vercel");
    return NextResponse.json({ email: 0, reason: "email not configured" });
  }

  // service role عشان نجيب إيميلات المستلمين بغض النظر عن RLS
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: users } = await admin
    .from("app_users")
    .select("id, email, notify_email, role, department, full_name");

  const recipients = (users ?? []).filter(u =>
    u.role === "manager" ||
    (u.department ?? "").toLowerCase() === NOTIFY_DEPT ||
    (order.created_by && u.id === order.created_by)
  );
  const emails = unique(recipients.map(u => (u.notify_email || u.email) as string).filter(Boolean));
  if (emails.length === 0) return NextResponse.json({ email: 0 });

  const creator = (users ?? []).find(u => u.id === order.created_by);
  const who = creator?.full_name || creator?.email || user.email || "";
  const wo = Array.isArray(order.work_order) ? order.work_order[0]?.wo_number : (order.work_order as any)?.wo_number;
  const label = order.order_no ? `#${order.order_no}` : "بدون رقم";
  const items = (order.purchase_items ?? []) as { item_name: string; quantity: number; category: string; expected_supply_date: string | null }[];
  const link = new URL("/purchases", request.url).toString();
  const title = `طلب شراء جديد ${label}`;

  const headRows: [string, string][] = [
    ["رقم أمر الشراء", label],
    ["أمر الشغل", wo ?? "بدون أمر شغل"],
    ["تاريخ الطلب", order.request_date],
    ["الحالة", order.status],
    ["أنشأه", who || "—"],
  ];
  const headHtml = headRows.map(([k, v]) => `
    <tr>
      <td style="padding:6px 12px;background:#f3f4f6;font-weight:bold;border:1px solid #e5e7eb">${esc(k)}</td>
      <td style="padding:6px 12px;border:1px solid #e5e7eb">${esc(v)}</td>
    </tr>`).join("");
  const itemsHtml = items.map(it => `
    <tr>
      <td style="padding:6px 12px;border:1px solid #e5e7eb">${esc(it.item_name)}</td>
      <td style="padding:6px 12px;border:1px solid #e5e7eb">${esc(String(it.quantity))} ${esc(it.category ?? "")}</td>
      <td style="padding:6px 12px;border:1px solid #e5e7eb">${esc(it.expected_supply_date ?? "—")}</td>
    </tr>`).join("");
  const itemsText = items.map(it => `- ${it.item_name}: ${it.quantity} ${it.category ?? ""} (متوقع: ${it.expected_supply_date ?? "—"})`).join("\n");

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({
      from: `"Electro George Factory" <${process.env.GMAIL_USER}>`,
      to: emails,
      subject: title,
      text: `${title}\n${headRows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nالبنود:\n${itemsText}\n\n${link}`,
      html: `
        <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">
          <h2 style="margin:0 0 12px">${esc(title)}</h2>
          <table style="border-collapse:collapse;margin-bottom:12px">${headHtml}</table>
          <table style="border-collapse:collapse;margin-bottom:12px">
            <tr>
              <th style="padding:6px 12px;background:#f3f4f6;border:1px solid #e5e7eb">الصنف</th>
              <th style="padding:6px 12px;background:#f3f4f6;border:1px solid #e5e7eb">الكمية</th>
              <th style="padding:6px 12px;background:#f3f4f6;border:1px solid #e5e7eb">التوريد المتوقع</th>
            </tr>
            ${itemsHtml}
          </table>
          <a href="${link}" style="background:#10b981;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none">فتح طلبات الشراء</a>
        </div>`,
    });
    return NextResponse.json({ email: emails.length });
  } catch (err) {
    console.error("Purchase order email failed:", err);
    return NextResponse.json({ email: 0, reason: "send failed" });
  }
}
