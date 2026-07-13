"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Plus, Sparkles, UploadCloud, XCircle } from "lucide-react";
import type { PdfUploadOut, Subject } from "@/lib/api";

type UploadState =
  | { phase: "uploading" }
  | { phase: "tracking"; pdfId: string; status: string; errorMessage?: string | null }
  | { phase: "error"; message: string };

type TrackedUpload = {
  id: string;
  fileName: string;
  state: UploadState;
};

const POLL_INTERVAL_MS = 3000;
// Generous enough to survive a Render free-tier cold start (can take 30-60s+
// to wake up) on top of the actual file upload.
const UPLOAD_TIMEOUT_MS = 90_000;
// Sentinel select value meaning "let the AI pipeline suggest the subject" —
// distinct from any real subject UUID.
const AUTO_DETECT = "__auto__";

const STATUS_META: Record<string, { label: string; icon: typeof Loader2; className: string }> = {
  pending: { label: "Queued...", icon: Loader2, className: "text-zinc-500" },
  processing: { label: "Reading the worksheet and extracting questions...", icon: Loader2, className: "text-indigo-500" },
  extracted: { label: "Done — questions added to the library.", icon: CheckCircle2, className: "text-emerald-600" },
  failed: { label: "Something went wrong processing this file.", icon: XCircle, className: "text-rose-500" },
};

export default function UploadDropzone({
  subjects,
  onUploaded,
}: {
  subjects: Subject[];
  onUploaded?: (pdf: PdfUploadOut) => void;
}) {
  const [localSubjects, setLocalSubjects] = useState(subjects);
  const [subjectId, setSubjectId] = useState(AUTO_DETECT);
  const [contentType, setContentType] = useState<"theory" | "practice">("practice");
  const [addingSubject, setAddingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [uploads, setUploads] = useState<TrackedUpload[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadsRef = useRef<TrackedUpload[]>([]);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  // A single persistent poller handles every in-flight upload at once, so
  // uploading several files doesn't spin up one interval per file.
  useEffect(() => {
    const interval = setInterval(async () => {
      const toPoll = uploadsRef.current.filter(
        (u): u is TrackedUpload & { state: { phase: "tracking"; pdfId: string; status: string } } =>
          u.state.phase === "tracking" && u.state.status !== "extracted" && u.state.status !== "failed"
      );
      for (const u of toPoll) {
        try {
          const res = await fetch(`/api/pdfs/${u.state.pdfId}/status`);
          if (!res.ok) continue;
          const data = await res.json();
          setUploads((prev) =>
            prev.map((x) =>
              x.id === u.id && x.state.phase === "tracking"
                ? { ...x, state: { ...x.state, status: data.status, errorMessage: data.error_message } }
                : x
            )
          );
        } catch {
          // transient network error — the next poll tick will retry
        }
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

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
      setGlobalError(data.error || "Could not add subject.");
      return;
    }
    setLocalSubjects((prev) => (prev.some((s) => s.id === data.id) ? prev : [...prev, data]));
    setSubjectId(data.id);
    setNewSubjectName("");
    setAddingSubject(false);
  }

  async function uploadOne(file: File, uploadId: string) {
    const form = new FormData();
    form.append("file", file);
    if (subjectId !== AUTO_DETECT) form.append("subject_id", subjectId);
    form.append("content_type", contentType);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const res = await fetch("/api/pdfs/upload", { method: "POST", body: form, signal: controller.signal });
      const data = await res.json();
      if (!res.ok) {
        setUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, state: { phase: "error", message: data.error || "Upload failed." } } : u))
        );
        return;
      }
      setUploads((prev) =>
        prev.map((u) => (u.id === uploadId ? { ...u, state: { phase: "tracking", pdfId: data.id, status: data.status } } : u))
      );
      onUploaded?.(data);
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "AbortError";
      setUploads((prev) =>
        prev.map((u) =>
          u.id === uploadId
            ? {
                ...u,
                state: {
                  phase: "error",
                  message: timedOut
                    ? "Upload timed out — the server may be waking up from idle. Please try again."
                    : "Upload failed — check your connection and try again.",
                },
              }
            : u
        )
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  function handleFiles(fileList: FileList) {
    const files = Array.from(fileList);
    const pdfFiles = files.filter((f) => f.type === "application/pdf");
    if (pdfFiles.length === 0) {
      setGlobalError("Only PDF files are accepted.");
      return;
    }
    setGlobalError(null);
    const newUploads: TrackedUpload[] = pdfFiles.map((file) => ({
      id: crypto.randomUUID(),
      fileName: file.name,
      state: { phase: "uploading" },
    }));
    setUploads((prev) => [...newUploads, ...prev]);
    newUploads.forEach((u, i) => uploadOne(pdfFiles[i], u.id));
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 font-semibold text-zinc-700">
        <FileText className="h-4 w-4 text-indigo-500" strokeWidth={2.2} />
        Upload worksheets (PDF)
      </h3>

      {!addingSubject && (
        <div className="mb-1 flex items-center gap-2">
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          >
            <option value={AUTO_DETECT}>✨ Auto-detect subject</option>
            {localSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={contentType}
            onChange={(e) => setContentType(e.target.value as "theory" | "practice")}
            title="Is this worksheet theory/explanation or practice questions?"
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
          >
            <option value="practice">Practice</option>
            <option value="theory">Theory</option>
          </select>
          <button
            title="Add a subject"
            onClick={() => setAddingSubject(true)}
            className="flex shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-300 p-2 text-zinc-500 transition hover:border-indigo-300 hover:text-indigo-600"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      )}

      {subjectId === AUTO_DETECT && !addingSubject && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-indigo-500">
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          The subject and topics will be detected automatically from each file.
        </p>
      )}

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
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm transition
          ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-zinc-300 hover:border-indigo-300 hover:bg-zinc-50"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = ""; // allow re-selecting the same file(s) again later
          }}
        />
        <UploadCloud className="h-6 w-6 text-zinc-400" strokeWidth={1.75} />
        <span className="text-zinc-500">Drop one or more PDFs here, or click to choose.</span>
      </div>

      {globalError && <p className="mt-3 text-sm text-rose-500">{globalError}</p>}

      {uploads.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {uploads.map((u) => {
            const meta =
              u.state.phase === "tracking"
                ? STATUS_META[u.state.status] ?? { label: u.state.status, icon: Loader2, className: "text-zinc-500" }
                : u.state.phase === "uploading"
                  ? { label: "Uploading...", icon: Loader2, className: "text-indigo-500" }
                  : { label: u.state.message, icon: XCircle, className: "text-rose-500" };
            const StatusIcon = meta.icon;
            const spinning = u.state.phase === "uploading" || (u.state.phase === "tracking" && StatusIcon === Loader2);
            return (
              <li key={u.id} className="flex items-start gap-2 rounded-lg bg-zinc-50 px-3 py-2.5 text-sm">
                <StatusIcon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.className} ${spinning ? "animate-spin" : ""}`} />
                <div>
                  <p className="font-medium text-zinc-700">{u.fileName}</p>
                  <p className={meta.className}>{meta.label}</p>
                  {u.state.phase === "tracking" && u.state.status === "failed" && u.state.errorMessage && (
                    <p className="mt-0.5 text-xs text-rose-500">{u.state.errorMessage}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
