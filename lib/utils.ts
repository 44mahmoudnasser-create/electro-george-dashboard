import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export const today = () => new Date().toISOString().split("T")[0];
export const thisMonth = () => new Date().toISOString().slice(0, 7);
// ألوان الحالات بقت في lib/status.ts (toneFor / TONE_TEXT)
