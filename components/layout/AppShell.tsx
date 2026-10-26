// القائمة الجانبية والإطار بقوا في app/layout.tsx (components/layout/AppFrame.tsx)
// علشان يفضلوا ثابتين بين الصفحات. المكوّن ده متساب علشان الصفحات اللي بتستخدمه
// (<AppShell role={role}>) تفضل شغالة زي ما هي من غير أي تعديل.
export default function AppShell({ children }: { children: React.ReactNode; role?: string }) {
  return <>{children}</>;
}
