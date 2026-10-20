export default function manifest() {
  return {
    name: "مصنع إلكترو جورج — نظام إدارة المصنع",
    short_name: "Electro George",
    description: "نظام إدارة المصنع: الصاج والدهان والتجميع والعمالة والعهد وأوامر الشغل",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    orientation: "portrait",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
