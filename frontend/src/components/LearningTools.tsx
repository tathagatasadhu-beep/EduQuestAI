"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, ExternalLink, MessageCircleQuestion } from "lucide-react";
import type { TheoryPdf } from "@/lib/api";
import TutorChat from "@/components/TutorChat";

function BookReferenceRow({ topicId }: { topicId: string }) {
  const [open, setOpen] = useState(false);
  const [pdfs, setPdfs] = useState<TheoryPdf[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || pdfs !== null) return;
    fetch(`/api/pdfs/theory?topic_id=${topicId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't load reference materials.");
        return data as TheoryPdf[];
      })
      .then(setPdfs)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load reference materials."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once per expand, not on every pdfs change
  }, [open, topicId]);

  return (
    <div className="border-t border-sky-100">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-sky-600 transition hover:bg-sky-50"
      >
        <span className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" strokeWidth={2.2} />
          Book Reference
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          {error && <p className="text-sm text-rose-500">{error}</p>}
          {!error && pdfs === null && <p className="text-sm text-sky-400">Loading...</p>}
          {pdfs && pdfs.length === 0 && (
            <p className="text-sm text-zinc-400">No reference materials for this topic yet.</p>
          )}
          {pdfs && pdfs.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {pdfs.map((p) => (
                <li key={p.id}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-sky-100 transition hover:bg-sky-50"
                  >
                    {p.original_name}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-sky-400" strokeWidth={2} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AiTutorRow({ subjectId, subjectName }: { subjectId: string; subjectName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-sky-100">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-sky-600 transition hover:bg-sky-50"
      >
        <span className="flex items-center gap-2">
          <MessageCircleQuestion className="h-4 w-4" strokeWidth={2.2} />
          AI Tutor
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <TutorChat subjectId={subjectId} subjectName={subjectName} />
        </div>
      )}
    </div>
  );
}

// Bottom collapsible replacing the old always-visible right-side
// ReferenceMaterials panel on the quiz page — bundles the same theory-PDF
// list ("Book Reference") plus a standing AI tutor entry point (distinct
// from QuestionCard's inline "why was I wrong" chat, which stays as-is)
// under one accordion, per the student-page design brief.
export default function LearningTools({
  topicId,
  subjectId,
  subjectName,
}: {
  topicId: string;
  subjectId: string;
  subjectName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section className="mt-6 overflow-hidden rounded-2xl ring-1 ring-sky-100">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-center gap-2 bg-sky-100 py-3 text-xs font-bold tracking-wide text-zinc-700 uppercase transition hover:bg-sky-200"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} strokeWidth={2.5} />
        Learning Tools
      </button>
      {expanded && (
        <div className="bg-sky-50/50">
          <BookReferenceRow topicId={topicId} />
          <AiTutorRow subjectId={subjectId} subjectName={subjectName} />
        </div>
      )}
    </section>
  );
}
