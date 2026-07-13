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
            className="border-zinc-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          <IconInput
            icon={Lock}
            type="password"
            required
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
            {submitting ? "Logging in..." : "Log In"}
          </button>
        </form>
        <p className="mt-3 text-center text-sm">
          <Link href="/parent/forgot-password" className="font-medium text-zinc-500 hover:text-brand-600">
            Forgot password?
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-zinc-500">
          New here?{" "}
          <Link href="/parent/signup" className="font-medium text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
