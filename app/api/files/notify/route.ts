import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { notifyDepartment } from "@/lib/notify";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { fileId, event } = await request.json();
  if (!fileId || !["received", "delivered"].includes(event)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // بنقرا الملف بصلاحيات اليوزر (RLS)، فمحدش يقدر يطلب إيميل عن ملف مش من قسمه
  const { data: file } = await supabase
    .from("files")
    .select("id, file_name, file_type, receive_date, delivery_date, work_order:work_orders(wo_number), supervisor:technicians(name)")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return NextResponse.json({ error: "not found" }, { status: 404 });

  const f = file as any;
  const woNumber = Array.isArray(f.work_order) ? f.work_order[0]?.wo_number : f.work_order?.wo_number;
  const supName = Array.isArray(f.supervisor) ? f.supervisor[0]?.name : f.supervisor?.name;

  const details: { label: string; value: string }[] = [
    { label: "أمر الشغل", value: woNumber ?? "بدون أمر شغل" },
    { label: "اسم الملف", value: f.file_name },
  ];
  if (f.file_type) details.push({ label: "نوع الملف", value: f.file_type });
  if (event === "received") {
    details.push({ label: "تاريخ الاستلام", value: f.receive_date ?? "—" });
  } else {
    details.push({ label: "سُلِّم إلى", value: supName ?? "—" });
    details.push({ label: "تاريخ التسليم", value: f.delivery_date ?? "—" });
  }

  const title = event === "received" ? "📥 تم استلام ملف" : "📤 تم تسليم ملف";
  const body = `${f.file_name}${woNumber ? ` — أمر ${woNumber}` : ""}`;

  const result = await notifyDepartment({
    senderId: user.id,
    title,
    body,
    url: "/files",
    origin: new URL(request.url).origin,
    details,
  });

  return NextResponse.json(result);
}
