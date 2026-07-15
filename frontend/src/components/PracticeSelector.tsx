"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssignedSubject, QuestionFilter } from "@/lib/api";

const FILTERS: { value: QuestionFilter; label: string }[] = [
  { value: "all", label: "All questions" },
  { value: "missed_1st", label: "Missed on 1st attempt" },
  { value: "missed_2nd", label: "Missed on 2nd attempt" },
];

export default function PracticeSelector({
  studentId,
  subjects,
}: {
  studentId: string;
  subjects: AssignedSubject[];
}) {
  const router = useRouter();
  const [subjectId, setSubjectId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [filter, setFilter] = useState<QuestionFilter>("all");

  const topics = useMemo(() => subjects.find((s) => s.id === subjectId)?.topics ?? [], [subjects, subjectId]);

  function handleSubjectChange(next: string) {
    setSubjectId(next);
    setTopicId("");
  }

  function handleStart() {
    if (!topicId) return;
    router.push(`/student/${studentId}/quiz/${topicId}?mode=session&filter=${filter}`);
  }

  const selectClass =
    "w-full rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 font-medium focus:border-sky-400 focus:outline-none disabled:opacity-50";

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-sky-100">
      <label className="mb-1.5 block text-xs font-semibold tracking-wide text-sky-400 uppercase">Subject</label>
      <select className={selectClass} value={subjectId} onChange={(e) => handleSubjectChange(e.target.value)}>
        <option value="">Choose a subject...</option>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <label className="mt-4 mb-1.5 block text-xs font-semibold tracking-wide text-sky-400 uppercase">Topic</label>
      <select
        className={selectClass}
        value={topicId}
        onChange={(e) => setTopicId(e.target.value)}
        disabled={!subjectId}
      >
        <option value="">Choose a topic...</option>
        {topics.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <label className="mt-4 mb-1.5 block text-xs font-semibold tracking-wide text-sky-400 uppercase">
        Which questions?
      </label>
      <select className={selectClass} value={filter} onChange={(e) => setFilter(e.target.value as QuestionFilter)}>
        {FILTERS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      <button
        onClick={handleStart}
        disabled={!topicId}
        className="mt-5 w-full rounded-xl bg-sky-600 py-3 font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Start Practice
      </button>
    </div>
  );
}
