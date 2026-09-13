"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Copy, KeyRound, Loader2, Pencil, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Assignment, MonthlyProgressStat, Student, Subject, Topic } from "@/lib/api";

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, options);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Something went wrong.");
  return data as T;
}

function currentMonthStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Half-open [active_from, active_until) window for a "YYYY-MM" month string.
// Date.UTC (not the local-time Date constructor) so a west-of-UTC parent
// doesn't get an off-by-one-day window — see migration 009's comment.
function monthWindow(monthStr: string): { active_from: string; active_until: string } {
  const [year, month] = monthStr.split("-").map(Number);
  return {
    active_from: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    active_until: new Date(Date.UTC(year, month, 1)).toISOString(),
  };
}

function monthLabel(monthStr: string): string {
  const [year, month] = monthStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
}

function previousMonthStr(monthStr: string): string {
  const [year, month] = monthStr.split("-").map(Number);
  const prev = new Date(Date.UTC(year, month - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
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
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());
  const [progress, setProgress] = useState<MonthlyProgressStat[]>([]);
  // Derived, not set synchronously at the top of the effect below (that
  // pattern trips react-hooks/set-state-in-effect) — loading is simply
  // "the month we last successfully loaded doesn't match what's selected."
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const progressLoading = loadedMonth !== selectedMonth;

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

  // Half-open interval overlap: does this assignment's window overlap the
  // currently selected month at all? Parsed via Date (not raw string
  // comparison) so it's safe regardless of the backend's exact ISO format.
  function overlapsSelectedMonth(a: Assignment): boolean {
    const { active_from: windowFrom, active_until: windowUntil } = monthWindow(selectedMonth);
    const wFrom = new Date(windowFrom).getTime();
    const wUntil = new Date(windowUntil).getTime();
    const aFrom = a.active_from ? new Date(a.active_from).getTime() : null;
    const aUntil = a.active_until ? new Date(a.active_until).getTime() : null;
    return (aFrom === null || aFrom < wUntil) && (aUntil === null || aUntil > wFrom);
  }

  function assignmentFor(subjectId: string, topicId: string | null) {
    return assignments.find((a) => a.subject_id === subjectId && a.topic_id === topicId && overlapsSelectedMonth(a));
  }

  useEffect(() => {
    let cancelled = false;
    const month = selectedMonth;
    const { active_from, active_until } = monthWindow(month);
    call<MonthlyProgressStat[]>(
      `/api/students/${student.id}/progress?active_from=${encodeURIComponent(active_from)}&active_until=${encodeURIComponent(active_until)}`
    )
      .then((stats) => {
        if (!cancelled) {
          setProgress(stats);
          setLoadedMonth(month);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProgress([]);
          setLoadedMonth(month);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, student.id]);

  async function copyPreviousMonth() {
    await guarded(async () => {
      const { active_from, active_until } = monthWindow(selectedMonth);
      const created = await call<Assignment[]>(`/api/students/${student.id}/assignments/rollover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active_from, active_until }),
      });
      setAssignments((prev) => {
        const createdIds = new Set(created.map((a) => a.id));
        return [...prev.filter((a) => !createdIds.has(a.id)), ...created];
      });
    });
  }

  async function toggleSubject(subject: Subject, assign: boolean) {
    await guarded(async () => {
      if (assign) {
        const { active_from, active_until } = monthWindow(selectedMonth);
        const created = await call<Assignment>(`/api/students/${student.id}/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject_id: subject.id, active_from, active_until }),
        });
        setAssignments((prev) => [...prev.filter((a) => a.id !== created.id), created]);
      } else {
        // Un-assigning the whole subject also drops any individually-assigned
        // topics under it — but only the rows active in the month being
        // viewed; a different month's rows for the same subject are untouched.
        const toRemove = assignments.filter((a) => a.subject_id === subject.id && overlapsSelectedMonth(a));
        for (const a of toRemove) {
          await call<void>(`/api/students/${student.id}/assignments/${a.id}`, { method: "DELETE" });
        }
        const removedIds = new Set(toRemove.map((a) => a.id));
        setAssignments((prev) => prev.filter((a) => !removedIds.has(a.id)));
      }
    });
  }

  async function toggleTopic(subject: Subject, topic: Topic, assign: boolean) {
    await guarded(async () => {
      const wholeSubject = assignmentFor(subject.id, null);
      const { active_from, active_until } = monthWindow(selectedMonth);
      if (assign) {
        const created = await call<Assignment>(`/api/students/${student.id}/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject_id: subject.id, topic_id: topic.id, active_from, active_until }),
        });
        setAssignments((prev) => [...prev.filter((a) => a.id !== created.id), created]);
      } else {
        const existing = assignmentFor(subject.id, topic.id);
        if (existing) {
          await call<void>(`/api/students/${student.id}/assignments/${existing.id}`, { method: "DELETE" });
          setAssignments((prev) => prev.filter((a) => a.id !== existing.id));
        } else if (wholeSubject) {
          // Whole subject is assigned (this month) but this one topic is being
          // excluded — drop the blanket assignment and replace it with every
          // other topic individually, for this same month.
          await call<void>(`/api/students/${student.id}/assignments/${wholeSubject.id}`, { method: "DELETE" });
          const others = (topicsBySubject[subject.id] ?? []).filter((t) => t.id !== topic.id);
          const created = await Promise.all(
            others.map((t) =>
              call<Assignment>(`/api/students/${student.id}/assignments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subject_id: subject.id, topic_id: t.id, active_from, active_until }),
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
                  className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-brand-400 focus:outline-none"
                />
                <input
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  placeholder="Grade level"
                  className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-brand-400 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button disabled={busy} type="submit" className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-brand-600">
                <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                Edit name / grade
              </button>
            )}
          </div>

          <div>
            {newCode ? (
              <div className="rounded-lg bg-brand-50 p-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-brand-800">
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                  New login code
                </p>
                <p className="flex items-center gap-1.5 font-mono text-sm text-brand-900">
                  <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
                  {newCode}
                </p>
                <p className="mt-1 text-xs text-brand-600">Shown once — write it down.</p>
              </div>
            ) : (
              <button
                disabled={busy}
                onClick={regenerateCode}
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-brand-600 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />}
                Regenerate login code
              </button>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
                Assigned subjects — {monthLabel(selectedMonth)}
              </p>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-xs focus:border-brand-400 focus:outline-none"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={copyPreviousMonth}
              className="mb-2 flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-brand-600 disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={2} />
              Copy {monthLabel(previousMonthStr(selectedMonth))}&apos;s picks here
            </button>
            <div className="flex flex-col gap-2">
              {subjects.map((subject) => {
                const topics = topicsBySubject[subject.id] ?? [];
                const wholeAssigned = !!assignmentFor(subject.id, null);
                const anyTopicAssigned = assignments.some(
                  (a) => a.subject_id === subject.id && a.topic_id !== null && overlapsSelectedMonth(a)
                );
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

          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Progress — {monthLabel(selectedMonth)}
            </p>
            {progressLoading ? (
              <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </p>
            ) : progress.length === 0 ? (
              <p className="text-xs text-zinc-400">Nothing assigned for this month yet.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {progress.map((p) => (
                  <div key={p.topic_id} className="flex items-center justify-between text-xs text-zinc-600">
                    <span>{p.topic_name}</span>
                    <span className="text-zinc-400">
                      {p.total_first_attempts === 0
                        ? "not started"
                        : `${p.total_first_attempts} attempted · ${p.accuracy_rate}% correct`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
