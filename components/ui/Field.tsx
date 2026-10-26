import { cn } from "@/lib/utils";

// حقل في فورم: عنوان + الحقل نفسه + توضيح أو رسالة خطأ
export default function Field({
  label, required, hint, error, className, children, htmlFor,
}: {
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={htmlFor} className="eg-label">
        {label}
        {required && <span className="mr-0.5 text-danger" aria-hidden>*</span>}
      </label>
      {children}
      {error ? <p className="eg-error">{error}</p> : hint ? <p className="eg-hint">{hint}</p> : null}
    </div>
  );
}

// رسالة خطأ داخل فورم أو نافذة
export function FormError({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn(
      "animate-fade-in rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs leading-5 text-danger",
      className,
    )}>
      {children}
    </p>
  );
}
