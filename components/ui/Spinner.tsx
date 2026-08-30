export default function Spinner({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <div className={`${className} border-2 border-border border-t-accent rounded-full animate-spin`} />
  );
}
