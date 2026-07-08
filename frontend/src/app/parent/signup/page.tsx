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
      <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white px-6 py-24">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl shadow-indigo-100/50 ring-1 ring-zinc-200">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
            <MailCheck className="h-6 w-6" strokeWidth={2} />
          </div>
          <h1 className="mb-2 text-xl font-bold text-zinc-800">Almost there</h1>
          <p className="text-sm text-zinc-500">{pendingMessage}</p>
          <Link href="/parent/login" className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white px-6 py-24">
      <Link href="/" className="mb-6 flex items-center gap-2 text-zinc-500 hover:text-zinc-700">
        <Sparkles className="h-5 w-5 text-indigo-500" />
        <span className="font-semibold">EduQuestAI</span>
      </Link>
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl shadow-indigo-100/50 ring-1 ring-zinc-200">
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
            className="border-zinc-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <IconInput
            icon={Mail}
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-zinc-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          <IconInput
            icon={Lock}
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-zinc-300 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-indigo-600 py-2.5 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Creating account..." : "Sign Up"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/parent/login" className="font-medium text-indigo-600 hover:text-indigo-700">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
