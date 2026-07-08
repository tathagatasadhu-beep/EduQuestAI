"use client";

import { CheckCircle2, KeyRound, Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AddStudentForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<{ name: string; code: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName, grade_level: gradeLevel || undefined }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || "Could not add student.");
      return;
    }
    setCreatedCode({ name: data.display_name, code: data.login_code });
    setDisplayName("");
    setGradeLevel("");
    setOpen(false);
  }

  function handleDone() {
    setCreatedCode(null);
    router.refresh();
  }

  if (createdCode) {
    return (
      <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-5">
        <div className="mb-1 flex items-center gap-2 text-indigo-800">
          <CheckCircle2 className="h-5 w-5" strokeWidth={2.2} />
          <p className="font-semibold">{createdCode.name} is ready!</p>
        </div>
        <p className="mb-2 flex items-center gap-2 font-mono text-lg text-indigo-900">
          <KeyRound className="h-4 w-4 text-indigo-500" strokeWidth={2} />
          {createdCode.code}
        </p>
        <p className="mb-3 text-sm text-indigo-600">
          Write this down — it&apos;s only shown once. Give it to your child to log in at /student/login.
        </p>
        <button
          onClick={handleDone}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          Got it
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-zinc-300 px-4 py-5 text-sm font-medium text-zinc-500 transition hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600"
      >
        <UserPlus className="h-5 w-5" strokeWidth={2} />
        Add a student
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <input
        autoFocus
        required
        placeholder="Student name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
      />
      <input
        placeholder="Grade level (optional)"
        value={gradeLevel}
        onChange={(e) => setGradeLevel(e.target.value)}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none"
      />
      {error && <p className="text-sm text-rose-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitting ? "Adding..." : "Add"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-4 py-2 text-sm text-zinc-500 transition hover:text-zinc-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
