import type { Metadata } from "next";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "Electro George — نظام قسم التجميع",
  description: "نظام متابعة قسم التجميع الميكانيكي",
  manifest: "/manifest.json",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen bg-bg font-cairo antialiased">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
