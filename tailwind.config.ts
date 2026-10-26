import type { Config } from "tailwindcss";

// الألوان كلها متعرفة كـ CSS variables في app/globals.css (قيم RGB)،
// علشان الـ opacity modifiers زي bg-accent/15 تفضل شغالة، وتغيير الثيم يبقى من مكان واحد.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        cairo: ["var(--font-cairo)", "Cairo", "system-ui", "sans-serif"],
        sans: ["var(--font-cairo)", "Cairo", "system-ui", "sans-serif"],
      },
      colors: {
        bg: v("bg"),
        card: v("card"),
        card2: v("card2"),
        card3: v("card3"),
        border: { DEFAULT: v("border"), strong: v("border-strong") },
        text: v("text"),
        subtext: v("subtext"),
        muted: v("muted"),
        accent: { DEFAULT: v("accent"), solid: v("accent-solid") },
        accent2: v("accent2"),
        success: { DEFAULT: v("success"), solid: v("success-solid") },
        warning: { DEFAULT: v("warning"), solid: v("warning-solid") },
        danger: { DEFAULT: v("danger"), solid: v("danger-solid") },
      },
      boxShadow: {
        card: "inset 0 1px 0 0 rgb(255 255 255 / 0.03), 0 1px 2px 0 rgb(0 0 0 / 0.25)",
        pop: "0 0 0 1px rgb(var(--border-strong) / 0.7), 0 18px 48px -12px rgb(0 0 0 / 0.65)",
        button: "inset 0 1px 0 0 rgb(255 255 255 / 0.14), 0 1px 2px 0 rgb(0 0 0 / 0.4)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      // الـ keyframes نفسها متعرفة في globals.css (بالبادئة eg-).
      // حركات الدخول بـ backwards: بعد ما تخلص مابتفضلش ماسكة transform (علشان hover والـ sticky يشتغلوا عادي)
      animation: {
        "fade-in": "eg-fade-in 0.2s ease-out backwards",
        "fade-out": "eg-fade-out 0.15s ease-in both",
        "fade-up": "eg-fade-up 0.32s cubic-bezier(0.2, 0.8, 0.2, 1) backwards",
        "page-in": "eg-fade-up 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) backwards",
        "scale-in": "eg-scale-in 0.18s cubic-bezier(0.2, 0.8, 0.2, 1) backwards",
        "scale-out": "eg-scale-out 0.14s ease-in both",
        "sheet-up": "eg-sheet-up 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) backwards",
        "sheet-down": "eg-sheet-down 0.18s ease-in both",
        "toast-in": "eg-toast-in 0.26s cubic-bezier(0.2, 0.8, 0.2, 1) backwards",
        "toast-out": "eg-toast-out 0.16s ease-in both",
        "pop-in": "eg-pop-in 0.14s cubic-bezier(0.2, 0.8, 0.2, 1) backwards",
      },
    },
  },
  plugins: [],
};
export default config;
