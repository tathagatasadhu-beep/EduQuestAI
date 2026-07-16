"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type { PdfOut, PdfTopic, PdfUploadOut, Subject, Topic } from "@/lib/api";
import UploadDropzone from "@/components/UploadDropzone";

const GRADE_OPTIONS = ["7", "8", "9", "10", "11", "12", "SSAT", "SAT"];
const PAGE_SIZE = 5;

const STATUS_META: Record<string, { label: string; icon: typeof Loader2; className: string }> = {
  pending: { label: "Queued", icon: Loader2, className: "text-zinc-500" },
  processing: { label: "Processing", icon: Loader2, className: "text-brand-500" },
  extracted: { label: "Ready", icon: CheckCircle2, className: "text-emerald-600" },
  failed: { label: "Failed", icon: XCircle, className: "text-rose-500" },
};

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, options);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Something went wrong.");
  return data as T;
}

type Row =
  | { kind: "pdf"; pdf: PdfOut }
  | { kind: "topic"; topic: Topic }
  | { kind: "empty" };

export default function LibraryManager({
  initialSubjects,
  initialTopicsBySubject,
  initialPdfs,
}: {
  initialSubjects: Subject[];
  initialTopicsBySubject: Record<string, Topic[]>;
  initialPdfs: PdfOut[];
}) {
  const [subjects, setSubjects] = useState(initialSubjects);
  const [topicsBySubject, setTopicsBySubject] = useState(initialTopicsBySubject);
  const [pdfs, setPdfs] = useState(initialPdfs);
  const [error, setError] = useState<string | null>(null);
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectGrade, setNewSubjectGrade] = useState("");
  const [addingTopicFor, setAddingTopicFor] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [contentTypeFilter, setContentTypeFilter] = useState<"all" | "theory" | "practice">("all");
  const [page, setPage] = useState(0);

  async function guarded(fn: () => Promise<void>) {
    try {
      setError(null);
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function refresh() {
    setRefreshing(true);
    await guarded(async () => {
      const [freshSubjects, freshPdfs] = await Promise.all([
        call<Subject[]>("/api/subjects"),
        call<PdfOut[]>("/api/pdfs"),
      ]);
      const topicEntries = await Promise.all(
        freshSubjects.map(async (s) => [s.id, await call<Topic[]>(`/api/subjects/${s.id}/topics`)] as const)
      );
      setSubjects(freshSubjects);
      setPdfs(freshPdfs);
      setTopicsBySubject(Object.fromEntries(topicEntries));
    });
    setRefreshing(false);
  }

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    await guarded(async () => {
      const subject = await call<Subject>("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSubjectName.trim(), grade_level: newSubjectGrade || undefined }),
      });
      setSubjects((prev) => (prev.some((s) => s.id === subject.id) ? prev : [...prev, subject]));
      setTopicsBySubject((prev) => ({ ...prev, [subject.id]: prev[subject.id] ?? [] }));
      setNewSubjectName("");
      setNewSubjectGrade("");
      setAddingSubject(false);
    });
  }

  async function renameSubject(id: string, name: string, grade_level: string) {
    await guarded(async () => {
      const subject = await call<Subject>(`/api/subjects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, grade_level: grade_level || null }),
      });
      setSubjects((prev) => prev.map((s) => (s.id === id ? subject : s)));
      setEditingSubjectId(null);
    });
  }

  async function deleteSubject(id: string) {
    setBusyId(id);
    await guarded(async () => {
      await call<void>(`/api/subjects/${id}`, { method: "DELETE" });
      setSubjects((prev) => prev.filter((s) => s.id !== id));
    });
    setBusyId(null);
    setConfirmingDeleteId(null);
  }

  async function moveSubject(id: string, direction: -1 | 1) {
    const grade = subjects.find((s) => s.id === id)?.grade_level ?? null;
    const group = subjects.filter((s) => (s.grade_level ?? null) === grade);
    const idx = group.findIndex((s) => s.id === id);
    const swapWith = group[idx + direction];
    if (!swapWith) return;
    const a = subjects.find((s) => s.id === id)!;
    const b = swapWith;
    await guarded(async () => {
      const updated = await call<Subject[]>("/api/subjects/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { id: a.id, sort_order: b.sort_order },
          { id: b.id, sort_order: a.sort_order },
        ]),
      });
      setSubjects(updated);
    });
  }

  async function handleAddTopic(subjectId: string, e: React.FormEvent) {
    e.preventDefault();
    if (!newTopicName.trim()) return;
    await guarded(async () => {
      const topic = await call<Topic>(`/api/subjects/${subjectId}/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTopicName.trim() }),
      });
      setTopicsBySubject((prev) => ({
        ...prev,
        [subjectId]: [...(prev[subjectId] ?? []), topic],
      }));
      setNewTopicName("");
      setAddingTopicFor(null);
    });
  }

  async function renameTopic(subjectId: string, topicId: string, name: string) {
    await guarded(async () => {
      const topic = await call<Topic>(`/api/subjects/topics/${topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setTopicsBySubject((prev) => ({
        ...prev,
        [subjectId]: (prev[subjectId] ?? []).map((t) => (t.id === topicId ? topic : t)),
      }));
      // A topic's name is also embedded (denormalized) in any PdfOut.topics
      // it's attached to — keep those in sync too.
      setPdfs((prev) =>
        prev.map((p) => ({
          ...p,
          topics: p.topics.map((t) => (t.id === topicId ? { ...t, name: topic.name } : t)),
        }))
      );
      setEditingTopicId(null);
    });
  }

  async function deleteTopic(subjectId: string, topicId: string) {
    setBusyId(topicId);
    await guarded(async () => {
      await call<void>(`/api/subjects/topics/${topicId}`, { method: "DELETE" });
      setTopicsBySubject((prev) => ({
        ...prev,
        [subjectId]: prev[subjectId].filter((t) => t.id !== topicId),
      }));
    });
    setBusyId(null);
    setConfirmingDeleteId(null);
  }

  async function deleteAllEmptyTopics() {
    setBusyId("bulk-empty-topics");
    await guarded(async () => {
      const failures: string[] = [];
      for (const subject of subjects) {
        for (const topic of orphanTopicsFor(subject.id)) {
          try {
            await call<void>(`/api/subjects/topics/${topic.id}`, { method: "DELETE" });
            setTopicsBySubject((prev) => ({
              ...prev,
              [subject.id]: prev[subject.id].filter((t) => t.id !== topic.id),
            }));
          } catch {
            failures.push(topic.name);
          }
        }
      }
      if (failures.length > 0) {
        throw new Error(`Couldn't delete: ${failures.join(", ")}`);
      }
    });
    setBusyId(null);
    setConfirmingDeleteId(null);
  }

  async function deletePdf(pdfId: string) {
    setBusyId(pdfId);
    await guarded(async () => {
      await call<void>(`/api/pdfs/${pdfId}`, { method: "DELETE" });
      setPdfs((prev) => prev.filter((p) => p.id !== pdfId));
    });
    setBusyId(null);
    setConfirmingDeleteId(null);
  }

  async function setPdfContentType(pdfId: string, contentType: "theory" | "practice") {
    await guarded(async () => {
      const pdf = await call<PdfOut>(`/api/pdfs/${pdfId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: contentType }),
      });
      setPdfs((prev) => prev.map((p) => (p.id === pdfId ? pdf : p)));
    });
  }

  // The only way a theory PDF (which never gets questions/topics extracted)
  // ends up under a topic at all — tags the worksheet directly.
  async function assignPdfTopic(pdf: PdfOut, topicId: string) {
    setBusyId(pdf.id);
    await guarded(async () => {
      const updated = await call<PdfOut>(`/api/pdfs/${pdf.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: pdf.content_type, topic_id: topicId }),
      });
      setPdfs((prev) => prev.map((p) => (p.id === pdf.id ? updated : p)));
    });
    setBusyId(null);
  }

  function onPdfUploaded(pdf: PdfUploadOut) {
    // The new PDF's subject may still be auto-detecting — this list doesn't
    // poll for status changes itself, so it shows under "Unsorted" here
    // until the parent hits Refresh once extraction finishes.
    setPdfs((prev) => [
      {
        id: pdf.id,
        original_name: pdf.original_name,
        status: pdf.status,
        error_message: pdf.error_message,
        content_type: pdf.content_type,
        subject_id: null,
        subject_name: null,
        question_count: 0,
        uploaded_at: new Date().toISOString(),
        topics: [],
      },
      ...prev,
    ]);
  }

  function orphanTopicsFor(subjectId: string): Topic[] {
    const topics = topicsBySubject[subjectId] ?? [];
    const subjectPdfs = pdfs.filter((p) => p.subject_id === subjectId);
    const coveredTopicIds = new Set(subjectPdfs.flatMap((p) => p.topics.map((t) => t.id)));
    return topics.filter((t) => !coveredTopicIds.has(t.id));
  }

  const totalEmptyTopics = useMemo(
    () => subjects.reduce((sum, s) => sum + orphanTopicsFor(s.id).length, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- orphanTopicsFor reads subjects/topicsBySubject/pdfs directly
    [subjects, topicsBySubject, pdfs]
  );

  const unsortedPdfs = pdfs.filter((p) => p.subject_id === null);
  const sortedSubjects = [...subjects].sort(
    (a, b) => (a.grade_level ?? "").localeCompare(b.grade_level ?? "") || a.sort_order - b.sort_order
  );

  const searchLower = search.trim().toLowerCase();
  const filteredSubjects = sortedSubjects.filter((subject) => {
    if (gradeFilter && (subject.grade_level ?? "") !== gradeFilter) return false;
    if (!searchLower) return true;
    const topics = topicsBySubject[subject.id] ?? [];
    const subjectPdfs = pdfs.filter((p) => p.subject_id === subject.id);
    return (
      subject.name.toLowerCase().includes(searchLower) ||
      topics.some((t) => t.name.toLowerCase().includes(searchLower)) ||
      subjectPdfs.some((p) => p.original_name.toLowerCase().includes(searchLower))
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredSubjects.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageSubjects = filteredSubjects.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  function updateFilter(fn: () => void) {
    fn();
    setPage(0);
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError(null)}>
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      )}

      <UploadDropzone subjects={subjects} onUploaded={onPdfUploaded} />

      {unsortedPdfs.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          <p className="flex-1">
            {unsortedPdfs.length} worksheet{unsortedPdfs.length === 1 ? "" : "s"} still detecting subject — refresh
            to see {unsortedPdfs.length === 1 ? "it" : "them"} in the table below.
          </p>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={2.2} />
            Refresh
          </button>
        </div>
      )}

      {!addingSubject ? (
        <button
          onClick={() => setAddingSubject(true)}
          className="flex items-center gap-1.5 self-start rounded-full border border-dashed border-brand-200 px-4 py-2 text-sm font-medium text-brand-600 transition hover:border-brand-400 hover:bg-brand-50"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          Add a subject
        </button>
      ) : (
        <form onSubmit={handleAddSubject} className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-100 bg-white p-3">
          <input
            autoFocus
            required
            placeholder="e.g. RSM Grade 8"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            className="min-w-[10rem] flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
          <input
            list="grade-options"
            placeholder="Grade (e.g. 8, SAT)"
            value={newSubjectGrade}
            onChange={(e) => setNewSubjectGrade(e.target.value)}
            className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
          <datalist id="grade-options">
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <button type="submit" className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            Add
          </button>
          <button type="button" onClick={() => setAddingSubject(false)} className="rounded-full px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700">
            Cancel
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" strokeWidth={2} />
          <input
            placeholder="Search subject, topic, or worksheet..."
            value={search}
            onChange={(e) => updateFilter(() => setSearch(e.target.value))}
            className="w-full rounded-lg border border-zinc-300 py-2 pr-3 pl-9 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-100 focus:outline-none"
          />
        </div>
        <select
          value={gradeFilter}
          onChange={(e) => updateFilter(() => setGradeFilter(e.target.value))}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
        >
          <option value="">All grades</option>
          {GRADE_OPTIONS.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <select
          value={contentTypeFilter}
          onChange={(e) => updateFilter(() => setContentTypeFilter(e.target.value as "all" | "theory" | "practice"))}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none"
        >
          <option value="all">Theory + Practice</option>
          <option value="theory">Theory only</option>
          <option value="practice">Practice only</option>
        </select>
        {totalEmptyTopics > 0 && (
          <DeleteAction
            id="bulk-empty-topics"
            label={`Delete ${totalEmptyTopics} empty topic${totalEmptyTopics === 1 ? "" : "s"}`}
            busy={busyId === "bulk-empty-topics"}
            confirming={confirmingDeleteId === "bulk-empty-topics"}
            onConfirm={() => setConfirmingDeleteId("bulk-empty-topics")}
            onCancel={() => setConfirmingDeleteId(null)}
            onDelete={deleteAllEmptyTopics}
          />
        )}
        <button
          onClick={refresh}
          disabled={refreshing}
          title="Refresh"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} strokeWidth={2.2} />
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-brand-100 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50/60 text-left text-xs font-semibold tracking-wide text-navy-700 uppercase">
              <th className="px-4 py-3">Grade</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Topic</th>
              <th className="px-4 py-3">Worksheet</th>
              <th className="px-4 py-3">Theory / Practice</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageSubjects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                  {sortedSubjects.length === 0
                    ? "No subjects yet — add one above to get started."
                    : "No subjects match your search/filters."}
                </td>
              </tr>
            )}
            {pageSubjects.map((subject) => {
              const topics = topicsBySubject[subject.id] ?? [];
              const subjectPdfs = pdfs
                .filter((p) => p.subject_id === subject.id)
                .filter((p) => contentTypeFilter === "all" || p.content_type === contentTypeFilter);
              const coveredTopicIds = new Set(subjectPdfs.flatMap((p) => p.topics.map((t) => t.id)));
              const orphanTopics = topics.filter((t) => !coveredTopicIds.has(t.id));

              const rows: Row[] = [
                ...subjectPdfs.map((pdf): Row => ({ kind: "pdf", pdf })),
                ...orphanTopics.map((topic): Row => ({ kind: "topic", topic })),
              ];
              if (rows.length === 0) rows.push({ kind: "empty" });

              return rows.map((row, i) => (
                <tr key={`${subject.id}-${i}`} className="border-b border-zinc-100 last:border-0 hover:bg-brand-50/30">
                  {i === 0 && (
                    <td rowSpan={rows.length} className="border-r border-zinc-100 px-4 py-3 align-top font-medium text-zinc-600">
                      {subject.grade_level || "—"}
                    </td>
                  )}
                  {i === 0 && (
                    <td rowSpan={rows.length} className="border-r border-zinc-100 px-4 py-3 align-top">
                      {editingSubjectId === subject.id ? (
                        <SubjectEditForm
                          subject={subject}
                          onSave={(name, grade) => renameSubject(subject.id, name, grade)}
                          onCancel={() => setEditingSubjectId(null)}
                        />
                      ) : (
                        <div>
                          <p className="font-semibold text-navy-900">{subject.name}</p>
                          <div className="mt-1.5 flex items-center gap-1">
                            <button title="Move up" onClick={() => moveSubject(subject.id, -1)} className="rounded p-1 text-zinc-400 hover:text-brand-600">
                              <ArrowUp className="h-3 w-3" strokeWidth={2} />
                            </button>
                            <button title="Move down" onClick={() => moveSubject(subject.id, 1)} className="rounded p-1 text-zinc-400 hover:text-brand-600">
                              <ArrowDown className="h-3 w-3" strokeWidth={2} />
                            </button>
                            <button title="Edit subject" onClick={() => setEditingSubjectId(subject.id)} className="rounded p-1 text-zinc-400 hover:text-brand-600">
                              <Pencil className="h-3 w-3" strokeWidth={2} />
                            </button>
                            {addingTopicFor === subject.id ? (
                              <form onSubmit={(e) => handleAddTopic(subject.id, e)} className="ml-1 flex items-center gap-1">
                                <input
                                  autoFocus
                                  required
                                  placeholder="Topic name"
                                  value={newTopicName}
                                  onChange={(e) => setNewTopicName(e.target.value)}
                                  className="w-32 rounded border border-zinc-300 px-1.5 py-0.5 text-xs focus:border-brand-400 focus:outline-none"
                                />
                                <button type="submit" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
                                  Add
                                </button>
                                <button type="button" onClick={() => setAddingTopicFor(null)} className="text-xs text-zinc-400 hover:text-zinc-600">
                                  <X className="h-3 w-3" />
                                </button>
                              </form>
                            ) : (
                              <button
                                title="Add topic"
                                onClick={() => {
                                  setAddingTopicFor(subject.id);
                                  setNewTopicName("");
                                }}
                                className="rounded p-1 text-zinc-400 hover:text-brand-600"
                              >
                                <Plus className="h-3 w-3" strokeWidth={2} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  )}

                  {row.kind === "pdf" && (
                    <>
                      <td className="px-4 py-3 text-zinc-700">
                        {row.pdf.topics.length > 0 ? (
                          <div className="flex flex-wrap gap-x-1.5 gap-y-1">
                            {row.pdf.topics.map((t, idx) => (
                              <span key={t.id} className="inline-flex items-center">
                                <EditableTopicName
                                  topic={t}
                                  editing={editingTopicId === t.id}
                                  onEdit={() => setEditingTopicId(t.id)}
                                  onCancel={() => setEditingTopicId(null)}
                                  onSave={(name) => renameTopic(subject.id, t.id, name)}
                                />
                                {idx < row.pdf.topics.length - 1 && <span className="mr-1">,</span>}
                              </span>
                            ))}
                          </div>
                        ) : topics.length > 0 ? (
                          <select
                            defaultValue=""
                            disabled={busyId === row.pdf.id}
                            onChange={(e) => e.target.value && assignPdfTopic(row.pdf, e.target.value)}
                            className="rounded-lg border border-dashed border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-500 focus:border-brand-400 focus:outline-none"
                          >
                            <option value="" disabled>
                              Assign a topic...
                            </option>
                            {topics.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-zinc-400 italic" title="Add a topic to this subject first">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <PdfCell pdf={row.pdf} />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={row.pdf.content_type}
                          disabled={busyId === row.pdf.id}
                          onChange={(e) => setPdfContentType(row.pdf.id, e.target.value as "theory" | "practice")}
                          className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-600"
                        >
                          <option value="practice">Practice</option>
                          <option value="theory">Theory</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DeleteAction
                          id={row.pdf.id}
                          busy={busyId === row.pdf.id}
                          confirming={confirmingDeleteId === row.pdf.id}
                          onConfirm={() => setConfirmingDeleteId(row.pdf.id)}
                          onCancel={() => setConfirmingDeleteId(null)}
                          onDelete={() => deletePdf(row.pdf.id)}
                        />
                      </td>
                    </>
                  )}

                  {row.kind === "topic" && (
                    <>
                      <td className="px-4 py-3 text-zinc-700">
                        <EditableTopicName
                          topic={row.topic}
                          editing={editingTopicId === row.topic.id}
                          onEdit={() => setEditingTopicId(row.topic.id)}
                          onCancel={() => setEditingTopicId(null)}
                          onSave={(name) => renameTopic(subject.id, row.topic.id, name)}
                        />
                      </td>
                      <td className="px-4 py-3 text-zinc-400 italic">No worksheets yet</td>
                      <td className="px-4 py-3 text-zinc-300">—</td>
                      <td className="px-4 py-3 text-right">
                        <DeleteAction
                          id={row.topic.id}
                          busy={busyId === row.topic.id}
                          confirming={confirmingDeleteId === row.topic.id}
                          onConfirm={() => setConfirmingDeleteId(row.topic.id)}
                          onCancel={() => setConfirmingDeleteId(null)}
                          onDelete={() => deleteTopic(subject.id, row.topic.id)}
                        />
                      </td>
                    </>
                  )}

                  {row.kind === "empty" && (
                    <>
                      <td className="px-4 py-3 text-zinc-300">—</td>
                      <td className="px-4 py-3 text-zinc-400 italic">No worksheets yet</td>
                      <td className="px-4 py-3 text-zinc-300">—</td>
                      <td className="px-4 py-3 text-right">
                        <DeleteAction
                          id={subject.id}
                          busy={busyId === subject.id}
                          confirming={confirmingDeleteId === subject.id}
                          onConfirm={() => setConfirmingDeleteId(subject.id)}
                          onCancel={() => setConfirmingDeleteId(null)}
                          onDelete={() => deleteSubject(subject.id)}
                        />
                      </td>
                    </>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm text-zinc-500">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={clampedPage === 0}
            className="flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
          </button>
          <span>
            Page {clampedPage + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={clampedPage >= totalPages - 1}
            className="flex items-center gap-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      )}
    </div>
  );
}

function PdfCell({ pdf }: { pdf: PdfOut }) {
  const meta = STATUS_META[pdf.status] ?? { label: pdf.status, icon: Loader2, className: "text-zinc-500" };
  const StatusIcon = meta.icon;
  const spinning = pdf.status === "pending" || pdf.status === "processing";
  return (
    <div>
      <p className="font-medium text-zinc-700">{pdf.original_name}</p>
      <p className={`flex items-center gap-1 text-xs ${meta.className}`}>
        <StatusIcon className={`h-3 w-3 ${spinning ? "animate-spin" : ""}`} />
        {meta.label}
        {pdf.status === "extracted" && ` · ${pdf.question_count} question${pdf.question_count === 1 ? "" : "s"}`}
      </p>
      {pdf.status === "failed" && pdf.error_message && <p className="text-xs text-rose-500">{pdf.error_message}</p>}
    </div>
  );
}

function DeleteAction({
  id,
  label,
  busy,
  confirming,
  onConfirm,
  onCancel,
  onDelete,
}: {
  id: string;
  label?: string;
  busy: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <button
          disabled={busy}
          onClick={onDelete}
          className="rounded-full bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Confirm"}
        </button>
        <button onClick={onCancel} className="rounded-full px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700">
          Cancel
        </button>
      </div>
    );
  }
  if (label) {
    return (
      <button
        onClick={onConfirm}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
        data-id={id}
      >
        <Trash2 className="h-4 w-4" strokeWidth={2} />
        {label}
      </button>
    );
  }
  return (
    <button title="Delete" onClick={onConfirm} className="rounded p-1.5 text-zinc-400 transition hover:bg-rose-50 hover:text-rose-500" data-id={id}>
      <Trash2 className="h-4 w-4" strokeWidth={2} />
    </button>
  );
}

function SubjectEditForm({
  subject,
  onSave,
  onCancel,
}: {
  subject: Subject;
  onSave: (name: string, grade: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(subject.name);
  const [grade, setGrade] = useState(subject.grade_level ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name.trim(), grade.trim());
      }}
      className="flex flex-col gap-1.5"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded border border-zinc-300 px-2 py-1 text-sm focus:border-brand-400 focus:outline-none"
      />
      <input
        list="grade-options"
        value={grade}
        onChange={(e) => setGrade(e.target.value)}
        placeholder="Grade"
        className="w-28 rounded border border-zinc-300 px-2 py-1 text-sm focus:border-brand-400 focus:outline-none"
      />
      <div className="flex gap-1.5">
        <button type="submit" className="rounded-full bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-600">
          Save
        </button>
        <button type="button" onClick={onCancel} className="rounded-full px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-700">
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditableTopicName({
  topic,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  topic: PdfTopic | Topic;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(topic.name);

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSave(name.trim());
        }}
        className="inline-flex items-center gap-1"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-28 rounded border border-zinc-300 px-1.5 py-0.5 text-xs focus:border-brand-400 focus:outline-none"
        />
        <button type="submit" className="text-xs font-semibold text-brand-600 hover:text-brand-700">
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setName(topic.name);
            onCancel();
          }}
          className="text-xs text-zinc-400 hover:text-zinc-600"
        >
          <X className="h-3 w-3" />
        </button>
      </form>
    );
  }

  return (
    <span className="group inline-flex items-center gap-1">
      {topic.name}
      <button title="Rename topic" onClick={onEdit} className="text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-brand-600">
        <Pencil className="h-3 w-3" strokeWidth={2} />
      </button>
    </span>
  );
}
