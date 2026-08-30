export default function EmptyState({ message = "لا توجد بيانات" }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-subtext gap-3">
      <span className="text-4xl">📭</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}
