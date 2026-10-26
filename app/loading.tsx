import { PageSkeleton } from "@/components/ui/Skeleton";

// بيظهر جوه الإطار (والقائمة الجانبية ثابتة) لحد ما بيانات الصفحة توصل من السيرفر
export default function Loading() {
  return <PageSkeleton />;
}
