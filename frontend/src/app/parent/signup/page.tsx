"use client";

import { Lock, Mail, MailCheck, Sparkles, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import IconInput from "@/components/IconInput";

export default function ParentSignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/parent-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, full_name: fullName }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || "Signup failed.");
      return;
    }
    if (data.pendingConfirmation) {
      setPendingMessage(data.message);
      return;
    }
    router.push("/parent");
    router.refresh();
  }

  if (pendingMessage) {
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-navy-950 px-6 py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_10%,rgba(61,90,254,0.3),transparent_45%)]"
        />
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl shadow-black/30">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-600">
            <MailCheck className="h-6 w-6" strokeWidth={2} />
          </div>
          <h1 className="mb-2 text-xl font-bold text-zinc-800">Almost there</h1>
          <p className="text-sm text-zinc-500">{pendingMessage}</p>
          <Link href="/parent/login" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
            Back to login
          </Link>
        </div>
      </div>
    );
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
        <h1 className="mb-1 text-xl font-bold text-zinc-800">Create your account</h1>
        <p className="mb-6 text-sm text-zinc-500">Start tracking your family&apos;s progress.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <IconInput
            icon={User}
            type="text"
            required
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="border-zinc-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <IconInput
            icon={Mail}
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-zinc-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <IconInput
            icon={Lock}
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-zinc-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-full bg-brand-500 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Creating account..." : "Sign Up"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/parent/login" className="font-medium text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
