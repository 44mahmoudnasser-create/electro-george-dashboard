// تحويل الكمية لكلام عربي (للخانة "المنصرف بالحروف")
// مثال: 5 + "عدد" → "خمسة عدد"، 2.5 + "كيلو" → "اثنان فاصلة خمسة كيلو"

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS = ["عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

const under100 = (n: number): string => {
  if (n === 0) return "";
  if (n < 10) return ONES[n];
  if (n === 10) return TEENS[0];
  if (n < 20) return TEENS[n - 10];
  const t = Math.floor(n / 10), o = n % 10;
  return o ? `${ONES[o]} و${TENS[t]}` : TENS[t];
};

const under1000 = (n: number): string => {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (r) parts.push(under100(r));
  return parts.join(" و");
};

const integerWords = (n: number): string => {
  if (n === 0) return "صفر";
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  if (millions) {
    parts.push(millions === 1 ? "مليون" : millions === 2 ? "مليونان" : `${under1000(millions)} ملايين`);
  }
  if (thousands) {
    parts.push(thousands === 1 ? "ألف" : thousands === 2 ? "ألفان" : thousands <= 10 ? `${under1000(thousands)} آلاف` : `${under1000(thousands)} ألف`);
  }
  if (rest) parts.push(under1000(rest));
  return parts.join(" و");
};

export function quantityToArabicWords(value: number | string | null | undefined, unit?: string | null): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (num === null || num === undefined || isNaN(num)) return "";
  const negative = num < 0;
  const abs = Math.abs(num);
  const [intPart, fracPart] = abs.toString().split(".");
  let words = integerWords(parseInt(intPart, 10));
  if (fracPart) {
    words += ` فاصلة ${integerWords(parseInt(fracPart, 10))}`;
  }
  if (negative) words = `ناقص ${words}`;
  return unit ? `${words} ${unit}` : words;
}
