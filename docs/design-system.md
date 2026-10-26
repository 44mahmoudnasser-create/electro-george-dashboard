# نظام التصميم — مصنع إلكترو جورج

دليل مختصر علشان أي صفحة جديدة تطلع بنفس شكل باقي النظام.

## الإطار
- القائمة الجانبية وشريط الموبايل في `components/layout/AppFrame.tsx` ومتركبين في `app/layout.tsx`، فبيفضلوا ثابتين بين الصفحات.
- الصفحات القديمة اللي فيها `<AppShell role={role}>` شغالة زي ما هي (المكوّن بقى بيعرض المحتوى بس).
- روابط القائمة ومجموعاتها في `lib/nav.ts`.
- `app/loading.tsx` بيعرض هيكل تحميل لحد ما بيانات الصفحة توصل، و`app/error.tsx` و`app/not-found.tsx` لشاشات الخطأ.

## الألوان (Tailwind)
كلها متعرفة كـ CSS variables في `app/globals.css` وبتقبل الشفافية (`bg-accent/10`):

| الاستخدام | الكلاس |
|---|---|
| خلفية التطبيق / الكروت / الحقول / hover | `bg-bg` · `bg-card` · `bg-card2` · `bg-card3` |
| الحدود | `border-border` · `border-border-strong` |
| النص الأساسي / الثانوي / الباهت | `text-text` · `text-subtext` · `text-muted` |
| اللون الأساسي (روابط ومؤشرات) | `text-accent` · وخلفية الزرار `bg-accent-solid` |
| الحالات | `success` · `warning` · `danger` · `accent2` (بنفسجي) |

ماتستخدمش ألوان Tailwind الجاهزة (`blue-500` …) ولا أكواد hex في الصفحات. ألوان الرسوم البيانية في `lib/chart-theme.ts`.

## كلاسات جاهزة (`app/globals.css`)
- كارت: `eg-card` (وللجداول `eg-card overflow-hidden !p-0`).
- أزرار: `eg-btn-primary` · `eg-btn-success` · `eg-btn-danger` · `eg-btn-danger-soft` · `eg-btn-ghost` · `eg-btn-subtle`، والمقاسات `eg-btn-sm` · `eg-btn-xs` · `eg-btn-icon`.
- زرار أيقونة جوه جدول: `eg-icon-btn` و`eg-icon-btn-danger` (ومعاه `aria-label` و`<Tooltip>`).
- حقول: `eg-input` · `eg-select` · `eg-label`، والمقاس الصغير `eg-input-sm`.
- جدول: `<table className="eg-table">` — الرأس والحدود والـ hover بيتعملوا لوحدهم. `eg-table-compact` للجداول الكثيفة، و`tabular-nums` للأرقام والتواريخ.
- دخول متتابع لشبكة كروت: `eg-stagger`.

## المكونات (`components/ui`)
```tsx
<Page width="6xl">
  <PageHeader title="..." icon={Icon} subtitle="..." back={{ href, label }}
    meta={<Badge label="جاري" />} actions={<>...</>} tabs={<Tabs .../>}>
    {/* صف فلاتر اختياري */}
  </PageHeader>
  <PageBody>...</PageBody>
</Page>
```
- `Badge` — لون الحالة بيتحدد تلقائي من النص (`lib/status.ts`)، ولو حالة جديدة ضيفها هناك.
- `StatCard` / `StatPill` / `ProgressBar` — المؤشرات والأرقام.
- `Tabs` (تبويبات بخط) و`Segmented` (اختيار وضع العرض).
- `FilterChip` + `ChipRow` و`SearchInput` — الفلاتر والبحث.
- `Modal` — نافذة بحركة، Esc بيقفلها، وعلى الموبايل بتطلع من تحت.
- `Field` + `FormError` — حقول الفورم ورسائل الخطأ.
- `EmptyState` · `Skeleton` · `Spinner` · `Tooltip`.

## الرسائل والتأكيد
```tsx
const toast = useToast();          // بدل alert()
toast.success("تم الحفظ"); toast.error(error.message);

const confirm = useConfirm();      // بدل confirm()
if (!(await confirm({ title: "حذف البند؟", confirmText: "حذف" }))) return;
```

## الحركة
الحركات قصيرة (أقل من ثلث ثانية) وبتستخدم الشفافية والإزاحة بس، وبتتلغي تلقائي لو الجهاز مفعّل "تقليل الحركة".
