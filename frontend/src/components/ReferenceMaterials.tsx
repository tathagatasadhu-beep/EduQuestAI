"use client";

import { useEffect, useState } from "react";
import { BookOpen, ExternalLink, Loader2 } from "lucide-react";
import type { TheoryPdf } from "@/lib/api";

export default function ReferenceMaterials({ subjectId }: { subjectId: string }) {
  const [pdfs, setPdfs] = useState<TheoryPdf[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPdfs(null);
    setError(null);
    fetch(`/api/pdfs/theory?subject_id=${subjectId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Couldn't load reference materials.");
        return data as TheoryPdf[];
      })
      .then((data) => {
        if (!cancelled) setPdfs(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load reference materials.");
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  if (error) return <p className="mb-6 text-sm text-rose-500">{error}</p>;

  if (pdfs === null) {
    return (
      <p className="mb-6 flex items-center gap-2 text-sm text-sky-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading reference materials...
      </p>
    );
  }

  // Nothing to reference for this subject yet — skip the section rather
  // than showing an empty box.
  if (pdfs.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-wide text-sky-400 uppercase">
        <BookOpen className="h-4 w-4" strokeWidth={2.2} />
        Reference Materials
      </h2>
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
    </section>
  );
}
