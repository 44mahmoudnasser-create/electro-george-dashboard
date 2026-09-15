export default function manifest() {
  return {
    id: "/",
    name: "توصيل | Delivery App",
    short_name: "توصيل",
    description: "تطبيق توصيل الطعام",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#FFFBF6",
    theme_color: "#FF6B35",
    orientation: "portrait",
    dir: "rtl",
    lang: "ar",
    categories: ["food", "shopping"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // صور شاشة حقيقية من التطبيق — لازم ترفعي الملفات دي بنفسك في
    // public/screenshots/ (مقاسات مضبوطة تحت في التعليمات)
    screenshots: [
      {
        src: "/screenshots/home-mobile.png",
        sizes: "1080x1920",
        type: "image/png",
        form_factor: "narrow",
        label: "الصفحة الرئيسية - قائمة المطاعم",
      },
      {
        src: "/screenshots/checkout-mobile.png",
        sizes: "1080x1920",
        type: "image/png",
        form_factor: "narrow",
        label: "إتمام الطلب",
      },
      {
        src: "/screenshots/home-desktop.png",
        sizes: "1920x1080",
        type: "image/png",
        form_factor: "wide",
        label: "الصفحة الرئيسية",
      },
    ],
    // اختصارات سريعة (لما المستخدم يعمل ضغطة طويلة على أيقونة التطبيق)
    shortcuts: [
      {
        name: "طلباتي",
        short_name: "طلباتي",
        description: "متابعة طلباتك السابقة",
        url: "/orders",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "الملف الشخصي",
        short_name: "بروفايلي",
        description: "بياناتك وعناوينك",
        url: "/profile",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
    prefer_related_applications: false,
    related_applications: [],
  };
}

