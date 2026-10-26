// ألوان الحالات والأولويات في مكان واحد، علشان أي شارة في أي صفحة تطلع بنفس اللون.

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "violet";

const STATUS_TONE: Record<string, Tone> = {
  // أوامر الشغل والبنود
  "لم يبدأ": "neutral",
  "جاري": "accent",
  "متوقف": "warning",
  "مكتمل": "success",
  "تم التسليم": "violet",
  // المشتريات
  "مفتوح": "warning",
  "تم التوريد": "success",
  "ملغي": "danger",
  // الحضور
  "حاضر": "success",
  "غياب": "danger",
  "أجازة": "warning",
  "إجازة": "warning",
  "مأمورية": "accent",
  // درجات الفنيين
  "مشرف": "violet",
  "فني": "neutral",
  "مساعد": "neutral",
  // الأولويات
  "عاجلة": "danger",
  "عالية": "warning",
  "متوسطة": "accent",
  "منخفضة": "neutral",
  // الأدوات والعهد
  "متاح": "success",
  "مع فني": "accent",
  "تالف": "warning",
  "مفقود": "danger",
  "مستلمة": "accent",
  "مرتجعة": "success",
  "مستهلكة": "neutral",
  "تالفة": "warning",
  "مفقودة": "danger",
  // أنواع الملفات
  "إضافة": "accent",
  "تعديل": "warning",
  "أمر الشغل نفسه": "violet",
  // اعتماد البنود
  "مسودة": "neutral",
  "في انتظار الاعتماد": "warning",
  "معتمد": "success",
  // حالات التجميع الميكانيكي (بتتخزن بالإنجليزي)
  "New": "neutral",
  "Partially Ready": "accent",
  "Ready to Start": "success",
  "In Progress": "accent",
  "Partially Blocked": "warning",
  "Blocked": "danger",
  "Packing": "violet",
  "Finished": "success",
  "Closed": "neutral",
};

export const toneFor = (label?: string | null): Tone =>
  (label && STATUS_TONE[label]) || "neutral";

// class جاهز لأي عنصر محتاج لون الحالة (مع eg-badge).
// الأسماء مكتوبة كاملة علشان Tailwind يلاقيها وهو بيبني الـ CSS.
const TONE_CLASS: Record<Tone, string> = {
  neutral: "tone-neutral",
  accent: "tone-accent",
  success: "tone-success",
  warning: "tone-warning",
  danger: "tone-danger",
  violet: "tone-violet",
};
export const toneClass = (tone: Tone) => TONE_CLASS[tone];

// لون النص فقط لكل tone (للأرقام والمؤشرات)
export const TONE_TEXT: Record<Tone | "default" | "muted", string> = {
  default: "text-text",
  muted: "text-subtext",
  neutral: "text-subtext",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  violet: "text-accent2",
};

// ترتيب الأولويات (الأهم الأول)
export const PRIORITY_RANK: Record<string, number> = { "عاجلة": 0, "عالية": 1, "متوسطة": 2, "منخفضة": 3 };
