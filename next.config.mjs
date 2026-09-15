/** @type {import('next').NextConfig} */
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: false,
  skipWaiting: true,
  importScripts: ["/sw-push.js"], // يضيف كود الـ push فوق service worker الأساسي
});

const nextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }] },
};

export default withPWA(nextConfig);