import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="grid min-h-full animate-page-in place-items-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-border/70 bg-card2 text-subtext">
          <SearchX className="size-6" strokeWidth={1.75} />
        </span>
        <p className="mt-4 font-mono text-xs text-muted">404</p>
        <h1 className="mt-1 text-lg font-bold text-text">الصفحة مش موجودة</h1>
        <p className="mt-1.5 text-sm leading-6 text-subtext">
          ممكن يكون الرابط غلط، أو العنصر اتمسح.
        </p>
        <Link href="/dashboard" className="eg-btn-primary mt-5">رجوع للوحة التحكم</Link>
      </div>
    </div>
  );
}
