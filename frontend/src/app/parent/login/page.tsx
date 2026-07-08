"use client";

import { Lock, Mail, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import IconInput from "@/components/IconInput";

export default function ParentLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/parent-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || "Login failed.");
      return;
    }
    router.push("/parent");
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white px-6 py-24">
      <Link href="/" className="mb-6 flex items-center gap-2 text-zinc-500 hover:text-zinc-700">
        <Sparkles className="h-5 w-5 text-indigo-500" />
        <span className="font-semibold">EduQuestAI</span>
      </Link>
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl shadow-indigo-100/50 ring-1 ring-zinc-200">
        <h1 className="mb-1 text-xl font-bold text-zinc-800">Welcome back</h1>
        <p className="mb-6 text-sm text-zinc-500">Log in to manage your family&apos;s practice.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
            {submitting ? "Logging in..." : "Log In"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-zinc-500">
          New here?{" "}
          <Link href="/parent/signup" className="font-medium text-indigo-600 hover:text-indigo-700">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
