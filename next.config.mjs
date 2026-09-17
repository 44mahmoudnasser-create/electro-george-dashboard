/** @type {import('next').NextConfig} */
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: false,
  skipWaiting: true,
  importScripts: ["/sw-push.js"],
  buildExcludes: [/manifest$/, /app-build-manifest/], // استثني الملفات المسببة للمشكلة
});

const nextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }] },
};

export default withPWA(nextConfig);
