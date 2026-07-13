import { ArrowLeft, BookOpen } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { getParentToken } from "@/lib/session";
import LibraryManager from "./LibraryManager";

export default async function LibraryPage() {
  const token = await getParentToken();
  if (!token) redirect("/parent/login");

  let subjects: Awaited<ReturnType<typeof api.listSubjects>>;
  let pdfs: Awaited<ReturnType<typeof api.listPdfs>>;
  try {
    [subjects, pdfs] = await Promise.all([api.listSubjects(), api.listPdfs(token)]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/parent/login");
    throw err;
  }

  const topicEntries = await Promise.all(
    subjects.map(async (s) => [s.id, await api.listTopics(s.id)] as const)
  );
  const topicsBySubject = Object.fromEntries(topicEntries);

  return (
    <div className="min-h-full bg-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-6 py-4">
          <Link
            href="/parent"
            className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-800"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
            Dashboard
          </Link>
          <span className="text-zinc-300">/</span>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-indigo-500" strokeWidth={2.2} />
            <span className="font-semibold text-zinc-800">Library</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900">Worksheet Library</h1>
        <p className="mb-8 text-sm text-zinc-500">
          Organize subjects and topics by grade, and manage the worksheets uploaded into each one.
        </p>
        <LibraryManager initialSubjects={subjects} initialTopicsBySubject={topicsBySubject} initialPdfs={pdfs} />
      </div>
    </div>
  );
}
