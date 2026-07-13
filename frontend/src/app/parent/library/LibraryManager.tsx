"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { PdfOut, PdfUploadOut, Subject, Topic } from "@/lib/api";
import PdfList from "./PdfList";
import UploadDropzone from "@/components/UploadDropzone";

const GRADE_OPTIONS = ["7", "8", "9", "10", "11", "12", "SSAT", "SAT"];

async function call<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, options);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Something went wrong.");
  return data as T;
}

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectGrade, setNewSubjectGrade] = useState("");
  const [addingTopicFor, setAddingTopicFor] = useState<string | null>(null);
  const [newTopicName, setNewTopicName] = useState("");
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    await guarded(async () => {
      await call<void>(`/api/subjects/${id}`, { method: "DELETE" });
      setSubjects((prev) => prev.filter((s) => s.id !== id));
    });
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
        [subjectId]: prev[subjectId].map((t) => (t.id === topicId ? topic : t)),
      }));
      setEditingTopicId(null);
    });
  }

  async function deleteTopic(subjectId: string, topicId: string) {
    await guarded(async () => {
      await call<void>(`/api/subjects/topics/${topicId}`, { method: "DELETE" });
      setTopicsBySubject((prev) => ({
        ...prev,
        [subjectId]: prev[subjectId].filter((t) => t.id !== topicId),
      }));
    });
  }

  async function moveTopic(subjectId: string, topicId: string, direction: -1 | 1) {
    const topics = topicsBySubject[subjectId] ?? [];
    const idx = topics.findIndex((t) => t.id === topicId);
    const swapWith = topics[idx + direction];
    if (!swapWith) return;
    const a = topics[idx];
    const b = swapWith;
    await guarded(async () => {
      const updated = await call<Topic[]>(`/api/subjects/${subjectId}/topics/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify([
          { id: a.id, sort_order: b.sort_order },
          { id: b.id, sort_order: a.sort_order },
        ]),
      });
      setTopicsBySubject((prev) => ({ ...prev, [subjectId]: updated }));
    });
  }

  async function deletePdf(pdfId: string) {
    await guarded(async () => {
      await call<void>(`/api/pdfs/${pdfId}`, { method: "DELETE" });
      setPdfs((prev) => prev.filter((p) => p.id !== pdfId));
    });
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
      },
      ...prev,
    ]);
  }

  const unsortedPdfs = pdfs.filter((p) => p.subject_id === null);

  const groups: { grade: string; subjects: Subject[] }[] = [];
  for (const s of subjects) {
    const grade = s.grade_level || "Ungraded";
    let g = groups.find((x) => x.grade === grade);
    if (!g) {
      g = { grade, subjects: [] };
      groups.push(g);
    }
    g.subjects.push(s);
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

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-semibold text-zinc-700">Upload worksheets</h3>
        <UploadDropzone subjects={subjects} onUploaded={onPdfUploaded} />
      </div>

      {unsortedPdfs.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-zinc-500">Unsorted (still detecting subject)</h3>
          <PdfList pdfs={unsortedPdfs} onDelete={deletePdf} onSetContentType={setPdfContentType} />
        </div>
      )}

      {!addingSubject ? (
        <button
          onClick={() => setAddingSubject(true)}
          className="flex items-center gap-1.5 self-start rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-500 transition hover:border-indigo-300 hover:text-indigo-600"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          Add a subject
        </button>
      ) : (
        <form onSubmit={handleAddSubject} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3">
          <input
            autoFocus
            required
            placeholder="e.g. RSM Grade 8"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            className="min-w-[10rem] flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          />
          <input
            list="grade-options"
            placeholder="Grade (e.g. 8, SAT)"
            value={newSubjectGrade}
            onChange={(e) => setNewSubjectGrade(e.target.value)}
            className="w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          />
          <datalist id="grade-options">
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Add
          </button>
          <button type="button" onClick={() => setAddingSubject(false)} className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700">
            Cancel
          </button>
        </form>
      )}

      {groups.map((group) => (
        <section key={group.grade}>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-zinc-400 uppercase">
            {group.grade === "Ungraded" ? "Ungraded" : `Grade ${group.grade}`}
          </h2>
          <div className="flex flex-col gap-3">
            {group.subjects.map((subject, idx) => {
              const isExpanded = expanded.has(subject.id);
              const topics = topicsBySubject[subject.id] ?? [];
              const subjectPdfs = pdfs.filter((p) => p.subject_id === subject.id);
              return (
                <div key={subject.id} className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button onClick={() => toggleExpanded(subject.id)} className="text-zinc-400 hover:text-zinc-700">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    {editingSubjectId === subject.id ? (
                      <SubjectEditForm
                        subject={subject}
                        onSave={(name, grade) => renameSubject(subject.id, name, grade)}
                        onCancel={() => setEditingSubjectId(null)}
                      />
                    ) : (
                      <>
                        <button onClick={() => toggleExpanded(subject.id)} className="flex-1 text-left font-medium text-zinc-800">
                          {subject.name}
                        </button>
                        <span className="text-xs text-zinc-400">
                          {topics.length} topic{topics.length === 1 ? "" : "s"} · {subjectPdfs.length} PDF{subjectPdfs.length === 1 ? "" : "s"}
                        </span>
                        <div className="flex items-center gap-0.5">
                          <button disabled={idx === 0} onClick={() => moveSubject(subject.id, -1)} className="rounded p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30">
                            <ArrowUp className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button
                            disabled={idx === group.subjects.length - 1}
                            onClick={() => moveSubject(subject.id, 1)}
                            className="rounded p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                          >
                            <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button onClick={() => setEditingSubjectId(subject.id)} className="rounded p-1 text-zinc-400 hover:text-indigo-600">
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                          <button onClick={() => deleteSubject(subject.id)} className="rounded p-1 text-zinc-400 hover:text-rose-500">
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-zinc-100 px-4 py-3">
                      <h4 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">Topics</h4>
                      <ul className="mb-3 flex flex-col gap-1">
                        {topics.map((topic, tIdx) => (
                          <li key={topic.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-zinc-50">
                            {editingTopicId === topic.id ? (
                              <TopicEditForm
                                topic={topic}
                                onSave={(name) => renameTopic(subject.id, topic.id, name)}
                                onCancel={() => setEditingTopicId(null)}
                              />
                            ) : (
                              <>
                                <span className="flex-1 text-sm text-zinc-700">{topic.name}</span>
                                <button disabled={tIdx === 0} onClick={() => moveTopic(subject.id, topic.id, -1)} className="rounded p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30">
                                  <ArrowUp className="h-3 w-3" strokeWidth={2} />
                                </button>
                                <button
                                  disabled={tIdx === topics.length - 1}
                                  onClick={() => moveTopic(subject.id, topic.id, 1)}
                                  className="rounded p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                                >
                                  <ArrowDown className="h-3 w-3" strokeWidth={2} />
                                </button>
                                <button onClick={() => setEditingTopicId(topic.id)} className="rounded p-1 text-zinc-400 hover:text-indigo-600">
                                  <Pencil className="h-3 w-3" strokeWidth={2} />
                                </button>
                                <button onClick={() => deleteTopic(subject.id, topic.id)} className="rounded p-1 text-zinc-400 hover:text-rose-500">
                                  <Trash2 className="h-3 w-3" strokeWidth={2} />
                                </button>
                              </>
                            )}
                          </li>
                        ))}
                        {topics.length === 0 && <p className="px-2 py-1 text-sm text-zinc-400">No topics yet.</p>}
                      </ul>

                      {addingTopicFor === subject.id ? (
                        <form onSubmit={(e) => handleAddTopic(subject.id, e)} className="mb-4 flex gap-2">
                          <input
                            autoFocus
                            required
                            placeholder="e.g. Compound Inequalities"
                            value={newTopicName}
                            onChange={(e) => setNewTopicName(e.target.value)}
                            className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
                          />
                          <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">
                            Add
                          </button>
                          <button type="button" onClick={() => setAddingTopicFor(null)} className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:text-zinc-700">
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button
                          onClick={() => {
                            setAddingTopicFor(subject.id);
                            setNewTopicName("");
                          }}
                          className="mb-4 flex items-center gap-1 text-xs font-medium text-indigo-500 hover:text-indigo-700"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                          Add topic
                        </button>
                      )}

                      <h4 className="mb-2 text-xs font-semibold tracking-wide text-zinc-400 uppercase">Worksheets</h4>
                      <PdfList pdfs={subjectPdfs} onDelete={deletePdf} onSetContentType={setPdfContentType} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
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
      className="flex flex-1 items-center gap-2"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 rounded-lg border border-zinc-300 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
      />
      <input
        list="grade-options"
        value={grade}
        onChange={(e) => setGrade(e.target.value)}
        placeholder="Grade"
        className="w-28 rounded-lg border border-zinc-300 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
      />
      <button type="submit" className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
        Save
      </button>
      <button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700">
        Cancel
      </button>
    </form>
  );
}

function TopicEditForm({
  topic,
  onSave,
  onCancel,
}: {
  topic: Topic;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(topic.name);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name.trim());
      }}
      className="flex flex-1 items-center gap-2"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 rounded-lg border border-zinc-300 px-2 py-1 text-sm focus:border-indigo-400 focus:outline-none"
      />
      <button type="submit" className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
        Save
      </button>
      <button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700">
        Cancel
      </button>
    </form>
  );
}
