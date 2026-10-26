import { cn } from "@/lib/utils";
import { toneFor, toneClass, type Tone } from "@/lib/status";

// شارة حالة: اللون بيتحدد تلقائي من النص (lib/status.ts)، أو يتحدد يدوي بـ tone
export default function Badge({
  label, tone, dot = true, className, children,
}: {
  label: string;
  tone?: Tone;
  dot?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <span className={cn("eg-badge", toneClass(tone ?? toneFor(label)), className)}>
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current opacity-80" />}
      {children ?? label}
    </span>
  );
}
