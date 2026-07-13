"use client";

import { CheckCircle2, Mail, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import IconInput from "@/components/IconInput";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not send reset email.");
      return;
    }
    setSent(true);
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-navy-950 px-6 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_10%,rgba(61,90,254,0.3),transparent_45%)]"
      />
      <Link href="/" className="mb-6 flex items-center gap-2 text-slate-300 hover:text-white">
        <Sparkles className="h-5 w-5 text-brand-400" />
        <span className="font-semibold">EduQuestAI</span>
      </Link>
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl shadow-black/30">
        {sent ? (
          <>
            <div className="mb-2 flex items-center gap-2 text-brand-700">
              <CheckCircle2 className="h-5 w-5" strokeWidth={2.2} />
              <h1 className="text-xl font-bold">Check your email</h1>
            </div>
            <p className="text-sm text-zinc-500">
              If an account exists for <span className="font-medium text-zinc-700">{email}</span>, a password reset
              link is on its way.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-xl font-bold text-zinc-800">Reset your password</h1>
            <p className="mb-6 text-sm text-zinc-500">Enter your email and we&apos;ll send you a reset link.</p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <IconInput
                icon={Mail}
                type="email"
                required
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-zinc-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              {error && <p className="text-sm text-rose-500">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="mt-2 rounded-full bg-brand-500 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Sending..." : "Send reset link"}
              </button>
            </form>
          </>
        )}
        <p className="mt-5 text-center text-sm text-zinc-500">
          <Link href="/parent/login" className="font-medium text-brand-600 hover:text-brand-700">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
