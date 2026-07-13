"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, KeyRound, Loader2, Pencil, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Assignment, Student, Subject, Topic } from "@/lib/api";

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, options);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Something went wrong.");
  return data as T;
}

export default function StudentSettings({
  student,
  subjects,
  topicsBySubject,
  initialAssignments,
}: {
  student: Student;
  subjects: Subject[];
  topicsBySubject: Record<string, Topic[]>;
  initialAssignments: Assignment[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(student.display_name);
  const [gradeLevel, setGradeLevel] = useState(student.grade_level ?? "");
  const [assignments, setAssignments] = useState(initialAssignments);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guarded(fn: () => Promise<void>) {
    try {
      setError(null);
      setBusy(true);
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    await guarded(async () => {
      await call(`/api/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName, grade_level: gradeLevel || null }),
      });
      setEditing(false);
      router.refresh();
    });
  }

  async function regenerateCode() {
    await guarded(async () => {
      const result = await call<{ login_code: string }>(`/api/students/${student.id}/login-code/regenerate`, {
        method: "POST",
      });
      setNewCode(result.login_code);
    });
  }

  function assignmentFor(subjectId: string, topicId: string | null) {
    return assignments.find((a) => a.subject_id === subjectId && a.topic_id === topicId);
  }

  async function toggleSubject(subject: Subject, assign: boolean) {
    await guarded(async () => {
      if (assign) {
        const created = await call<Assignment>(`/api/students/${student.id}/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject_id: subject.id }),
        });
        setAssignments((prev) => [...prev.filter((a) => a.subject_id !== subject.id), created]);
      } else {
        // Un-assigning the whole subject also drops any individually-assigned topics under it.
        const toRemove = assignments.filter((a) => a.subject_id === subject.id);
        for (const a of toRemove) {
          await call<void>(`/api/students/${student.id}/assignments/${a.id}`, { method: "DELETE" });
        }
        setAssignments((prev) => prev.filter((a) => a.subject_id !== subject.id));
      }
    });
  }

  async function toggleTopic(subject: Subject, topic: Topic, assign: boolean) {
    await guarded(async () => {
      const wholeSubject = assignmentFor(subject.id, null);
      if (assign) {
        const created = await call<Assignment>(`/api/students/${student.id}/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject_id: subject.id, topic_id: topic.id }),
        });
        setAssignments((prev) => [...prev, created]);
      } else {
        const existing = assignmentFor(subject.id, topic.id);
        if (existing) {
          await call<void>(`/api/students/${student.id}/assignments/${existing.id}`, { method: "DELETE" });
          setAssignments((prev) => prev.filter((a) => a.id !== existing.id));
        } else if (wholeSubject) {
          // Whole subject is assigned but this one topic is being excluded — drop the
          // blanket assignment and replace it with every other topic individually.
          await call<void>(`/api/students/${student.id}/assignments/${wholeSubject.id}`, { method: "DELETE" });
          const others = (topicsBySubject[subject.id] ?? []).filter((t) => t.id !== topic.id);
          const created = await Promise.all(
            others.map((t) =>
              call<Assignment>(`/api/students/${student.id}/assignments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject_id: subject.id, topic_id: t.id }),
              })
            )
          );
          setAssignments((prev) => [...prev.filter((a) => a.id !== wholeSubject.id), ...created]);
        }
      }
    });
  }

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-xs font-semibold tracking-wide text-zinc-400 uppercase hover:text-zinc-600"
      >
        Manage
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-4">
          {error && <p className="text-xs text-rose-500">{error}</p>}

          <div>
            {editing ? (
              <form onSubmit={saveEdit} className="flex flex-col gap-2">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                />
                <input
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  placeholder="Grade level"
                  className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button disabled={busy} type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-indigo-600">
                <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                Edit name / grade
              </button>
            )}
          </div>

          <div>
            {newCode ? (
              <div className="rounded-lg bg-indigo-50 p-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-indigo-800">
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                  New login code
                </p>
                <p className="flex items-center gap-1.5 font-mono text-sm text-indigo-900">
                  <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
                  {newCode}
                </p>
                <p className="mt-1 text-xs text-indigo-600">Shown once — write it down.</p>
              </div>
            ) : (
              <button
                disabled={busy}
                onClick={regenerateCode}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-indigo-600 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />}
                Regenerate login code
              </button>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">Assigned subjects</p>
            <div className="flex flex-col gap-2">
              {subjects.map((subject) => {
                const topics = topicsBySubject[subject.id] ?? [];
                const wholeAssigned = !!assignmentFor(subject.id, null);
                const anyTopicAssigned = assignments.some((a) => a.subject_id === subject.id && a.topic_id !== null);
                return (
                  <div key={subject.id} className="rounded-lg bg-zinc-50 p-2">
                    <label className="flex items-center gap-2 text-sm text-zinc-700">
                      <input
                        type="checkbox"
                        checked={wholeAssigned || anyTopicAssigned}
                        disabled={busy}
                        onChange={(e) => toggleSubject(subject, e.target.checked)}
                      />
                      {subject.name}
                      {subject.grade_level && <span className="text-xs text-zinc-400">Grade {subject.grade_level}</span>}
                    </label>
                    {(wholeAssigned || anyTopicAssigned) && topics.length > 0 && (
                      <div className="mt-1.5 ml-6 flex flex-col gap-1">
                        {topics.map((topic) => (
                          <label key={topic.id} className="flex items-center gap-2 text-xs text-zinc-600">
                            <input
                              type="checkbox"
                              checked={wholeAssigned || !!assignmentFor(subject.id, topic.id)}
                              disabled={busy}
                              onChange={(e) => toggleTopic(subject, topic, e.target.checked)}
                            />
                            {topic.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {subjects.length === 0 && <p className="text-xs text-zinc-400">No subjects in the library yet.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
