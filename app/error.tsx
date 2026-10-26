"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

// أي خطأ غير متوقع في صفحة بيظهر هنا بدل الشاشة البيضا، مع زرار إعادة المحاولة
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className="grid min-h-full animate-page-in place-items-center px-4 py-16">
      <div className="eg-card w-full max-w-md text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-danger/10 text-danger ring-1 ring-inset ring-danger/25">
          <AlertTriangle className="size-6" />
        </span>
        <h1 className="mt-4 text-base font-bold text-text">حصلت مشكلة وإحنا بنفتح الصفحة</h1>
        <p className="mt-1.5 text-sm leading-6 text-subtext">
          جرّب تاني. لو المشكلة فضلت موجودة، ابعت الرسالة دي للمسؤول عن النظام.
        </p>
        {error.message && (
          <p dir="ltr" className="mt-3 break-words rounded-lg border border-border/70 bg-card2/70 px-3 py-2 text-start font-mono text-[11px] text-subtext">
            {error.message}{error.digest ? ` (${error.digest})` : ""}
          </p>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Link href="/dashboard" className="eg-btn-ghost">لوحة التحكم</Link>
          <button onClick={reset} className="eg-btn-primary">
            <RotateCcw className="size-4" />إعادة المحاولة
          </button>
        </div>
      </div>
    </div>
  );
}
