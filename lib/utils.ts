import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export const today = () => new Date().toISOString().split("T")[0];
export const thisMonth = () => new Date().toISOString().slice(0, 7);
export const STATUS_COLORS: Record<string, string> = {
  "لم يبدأ":   "bg-slate-500/20 text-slate-300",
  "جاري":       "bg-blue-500/20 text-blue-300",
  "متوقف":      "bg-yellow-500/20 text-yellow-300",
  "مكتمل":      "bg-emerald-500/20 text-emerald-300",
  "تم التسليم": "bg-indigo-500/20 text-indigo-300",
  "مفتوح":      "bg-yellow-500/20 text-yellow-300",
  "تم التوريد": "bg-emerald-500/20 text-emerald-300",
  "ملغي":       "bg-red-500/20 text-red-300",
};
