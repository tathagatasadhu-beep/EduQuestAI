"use client";

import { useState } from "react";
import { CheckCircle2, FileText, Loader2, Trash2, XCircle } from "lucide-react";
import type { PdfOut } from "@/lib/api";

const STATUS_META: Record<string, { label: string; icon: typeof Loader2; className: string }> = {
  pending: { label: "Queued", icon: Loader2, className: "text-zinc-500" },
  processing: { label: "Processing", icon: Loader2, className: "text-indigo-500" },
  extracted: { label: "Ready", icon: CheckCircle2, className: "text-emerald-600" },
  failed: { label: "Failed", icon: XCircle, className: "text-rose-500" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function PdfList({
  pdfs,
  onDelete,
  onSetContentType,
}: {
  pdfs: PdfOut[];
  onDelete: (pdfId: string) => Promise<void>;
  onSetContentType: (pdfId: string, contentType: "theory" | "practice") => Promise<void>;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (pdfs.length === 0) {
    return <p className="px-1 py-2 text-sm text-zinc-400">No worksheets uploaded here yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {pdfs.map((pdf) => {
        const meta = STATUS_META[pdf.status] ?? { label: pdf.status, icon: Loader2, className: "text-zinc-500" };
        const StatusIcon = meta.icon;
        const spinning = pdf.status === "pending" || pdf.status === "processing";
        const busy = busyId === pdf.id;
        return (
          <li key={pdf.id} className="rounded-lg bg-zinc-50 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-zinc-700">{pdf.original_name}</p>
                  <select
                    value={pdf.content_type}
                    disabled={busy}
                    onChange={async (e) => {
                      setBusyId(pdf.id);
                      await onSetContentType(pdf.id, e.target.value as "theory" | "practice");
                      setBusyId(null);
                    }}
                    className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-xs font-medium text-zinc-600"
                  >
                    <option value="practice">Practice</option>
                    <option value="theory">Theory</option>
                  </select>
                </div>
                <p className={`mt-0.5 flex items-center gap-1.5 text-xs ${meta.className}`}>
                  <StatusIcon className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`} />
                  {meta.label}
                  {pdf.status === "extracted" && ` · ${pdf.question_count} question${pdf.question_count === 1 ? "" : "s"}`}
                  <span className="text-zinc-400">· {formatDate(pdf.uploaded_at)}</span>
                </p>
                {pdf.status === "failed" && pdf.error_message && (
                  <p className="mt-1 text-xs text-rose-500">{pdf.error_message}</p>
                )}
              </div>
              {confirmingId === pdf.id ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    disabled={busy}
                    onClick={async () => {
                      setBusyId(pdf.id);
                      await onDelete(pdf.id);
                      setBusyId(null);
                      setConfirmingId(null);
                    }}
                    className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    {busy ? "Deleting…" : "Confirm"}
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  title="Delete this PDF"
                  onClick={() => setConfirmingId(pdf.id)}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-rose-50 hover:text-rose-500"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
