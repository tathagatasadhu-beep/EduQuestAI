import { Sparkles } from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import StudentNav from "@/components/StudentNav";

export default async function StudentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-gradient-to-b from-purple-50 via-pink-50/40 to-white">
      <header className="border-b border-purple-100/70 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2 text-purple-600">
            <Sparkles className="h-4 w-4" strokeWidth={2.2} />
            <span className="text-sm font-bold">EduQuestAI</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <main className="flex-1 pb-20">{children}</main>

      <StudentNav studentId={studentId} />
    </div>
  );
}
