// ألوان الرسوم البيانية (recharts بياخد ألوان صريحة، فهي نفس قيم التوكنز في globals.css)
export const CHART = {
  grid: "#262b38",
  axis: "#8f97ab",
  tooltipBg: "#12151c",
  tooltipBorder: "#333a4a",
  text: "#e6e9f0",
  accent: "#6b9bfa",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  violet: "#a78bfa",
  neutral: "#6b7387",
} as const;

// إعدادات جاهزة لمكونات recharts
export const chartAxisTick = { fill: CHART.axis, fontSize: 11 };
export const chartTooltipStyle = {
  contentStyle: {
    background: CHART.tooltipBg,
    border: `1px solid ${CHART.tooltipBorder}`,
    borderRadius: 10,
    fontSize: 12,
    color: CHART.text,
    boxShadow: "0 12px 32px -12px rgb(0 0 0 / 0.6)",
  },
  labelStyle: { color: CHART.text, fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: CHART.text },
  cursor: { fill: "rgb(255 255 255 / 0.04)" },
};
