"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import type { PdfOut, PdfUploadOut, Subject, Topic } from "@/lib/api";
import UploadDropzone from "@/components/UploadDropzone";

const GRADE_OPTIONS = ["7", "8", "9", "10", "11", "12", "SSAT", "SAT"];

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
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function guarded(fn: () => Promise<void>) {
    try {
      setError(null);
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
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

  function onPdfUploaded(pdf: PdfUploadOut) {
    // The new PDF's subject may still be auto-detecting — this list doesn't
    // poll for status changes itself, so it shows under "Unsorted" here
    // until the page is refreshed once extraction finishes.
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

  const unsortedPdfs = pdfs.filter((p) => p.subject_id === null);
  const sortedSubjects = [...subjects].sort(
    (a, b) => (a.grade_level ?? "").localeCompare(b.grade_level ?? "") || a.sort_order - b.sort_order
  );

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
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          {unsortedPdfs.length} worksheet{unsortedPdfs.length === 1 ? "" : "s"} still detecting subject — refresh
          in a moment to see {unsortedPdfs.length === 1 ? "it" : "them"} in the table below.
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
            {sortedSubjects.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                  No subjects yet — add one above to get started.
                </td>
              </tr>
            )}
            {sortedSubjects.map((subject) => {
              const topics = topicsBySubject[subject.id] ?? [];
              const subjectPdfs = pdfs.filter((p) => p.subject_id === subject.id);
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
                        {row.pdf.topics.length > 0 ? row.pdf.topics.map((t) => t.name).join(", ") : "—"}
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
                      <td className="px-4 py-3 text-zinc-700">{row.topic.name}</td>
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
  busy,
  confirming,
  onConfirm,
  onCancel,
  onDelete,
}: {
  id: string;
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
