"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Plus, UploadCloud, XCircle } from "lucide-react";
import type { Subject } from "@/lib/api";

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading" }
  | { phase: "tracking"; pdfId: string; status: string; originalName: string }
  | { phase: "error"; message: string };

const POLL_INTERVAL_MS = 3000;

const STATUS_META: Record<string, { label: string; icon: typeof Loader2; className: string }> = {
  pending: { label: "Queued...", icon: Loader2, className: "text-zinc-500" },
  processing: { label: "Reading the worksheet and extracting questions...", icon: Loader2, className: "text-indigo-500" },
  extracted: { label: "Done — questions added to the library.", icon: CheckCircle2, className: "text-emerald-600" },
  failed: { label: "Something went wrong processing this file.", icon: XCircle, className: "text-rose-500" },
};

export default function UploadDropzone({ subjects }: { subjects: Subject[] }) {
  const [localSubjects, setLocalSubjects] = useState(subjects);
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "");
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.phase !== "tracking") return;
    if (state.status === "extracted" || state.status === "failed") return;

    const id = setInterval(async () => {
      const res = await fetch(`/api/pdfs/${state.pdfId}/status`);
      if (!res.ok) return;
      const data = await res.json();
      setState((prev) => (prev.phase === "tracking" ? { ...prev, status: data.status } : prev));
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [state]);

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    const res = await fetch("/api/subjects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSubjectName.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setState({ phase: "error", message: data.error || "Could not add subject." });
      return;
    }
    setLocalSubjects((prev) => (prev.some((s) => s.id === data.id) ? prev : [...prev, data]));
    setSubjectId(data.id);
    setNewSubjectName("");
    setAddingSubject(false);
  }

  async function handleFile(file: File) {
    if (!subjectId) {
      setState({ phase: "error", message: "Add or choose a subject first." });
      return;
    }
    if (file.type !== "application/pdf") {
      setState({ phase: "error", message: "Only PDF files are accepted." });
      return;
    }

    setState({ phase: "uploading" });
    const form = new FormData();
    form.append("file", file);
    form.append("subject_id", subjectId);

    const res = await fetch("/api/pdfs/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) {
      setState({ phase: "error", message: data.error || "Upload failed." });
      return;
    }
    setState({ phase: "tracking", pdfId: data.id, status: data.status, originalName: data.original_name });
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 font-semibold text-zinc-700">
        <FileText className="h-4 w-4 text-indigo-500" strokeWidth={2.2} />
        Upload a worksheet (PDF)
      </h3>

      <div className="mb-3 flex items-center gap-2">
        {localSubjects.length > 0 && !addingSubject && (
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          >
            {localSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        {!addingSubject && (
          <button
            onClick={() => setAddingSubject(true)}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 transition hover:border-indigo-300 hover:text-indigo-600"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
            {localSubjects.length === 0 ? "Add a subject" : ""}
          </button>
        )}
      </div>

      {addingSubject && (
        <form onSubmit={handleAddSubject} className="mb-3 flex gap-2">
          <input
            autoFocus
            required
            placeholder="e.g. AP Calculus"
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          />
          <button type="submit" className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Add
          </button>
          <button
            type="button"
            onClick={() => setAddingSubject(false)}
            className="shrink-0 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700"
          >
            Cancel
          </button>
        </form>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition
          ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-zinc-300 hover:border-indigo-300 hover:bg-zinc-50"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {state.phase === "uploading" ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            <span className="text-indigo-500">Uploading...</span>
          </>
        ) : (
          <>
            <UploadCloud className="h-6 w-6 text-zinc-400" strokeWidth={1.75} />
            <span className="text-zinc-500">Drop a PDF here, or click to choose one.</span>
          </>
        )}
      </div>

      {state.phase === "tracking" &&
        (() => {
          const meta = STATUS_META[state.status] ?? { label: state.status, icon: Loader2, className: "text-zinc-500" };
          const StatusIcon = meta.icon;
          return (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-zinc-50 px-3 py-2.5 text-sm">
              <StatusIcon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.className} ${state.status !== "extracted" && state.status !== "failed" ? "animate-spin" : ""}`} />
              <div>
                <p className="font-medium text-zinc-700">{state.originalName}</p>
                <p className={meta.className}>{meta.label}</p>
              </div>
            </div>
          );
        })()}

      {state.phase === "error" && <p className="mt-3 text-sm text-rose-500">{state.message}</p>}
    </div>
  );
}
