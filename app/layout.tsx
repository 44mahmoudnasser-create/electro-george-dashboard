import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";
import AppFrame from "@/components/layout/AppFrame";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { getShellUser } from "@/lib/get-shell-user";

// الخط بيتحمّل من السيرفر بتاعنا (من غير طلب لـ Google وقت فتح الصفحة، ومن غير قفزة في النص)
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "مصنع إلكترو جورج — نظام إدارة المصنع",
  description: "نظام إدارة المصنع: الصاج والدهان والتجميع والعمالة والعهد وأوامر الشغل",
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getShellUser();
  const collapsed = cookies().get("eg_sidebar")?.value === "collapsed";

  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className="min-h-screen bg-bg font-cairo antialiased">
        <RegisterSW />
        <ToastProvider>
          <ConfirmProvider>
            <AppFrame initialUser={user} initialCollapsed={collapsed}>
              {children}
            </AppFrame>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
