import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Electro George — نظام قسم التجميع",
  description: "نظام متابعة قسم التجميع الميكانيكي",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-bg font-cairo antialiased">{children}</body>
    </html>
  );
}
