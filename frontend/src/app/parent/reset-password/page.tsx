"use client";

import { createClient } from "@supabase/supabase-js";
import { AlertCircle, CheckCircle2, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import IconInput from "@/components/IconInput";

// This page is the one deliberate exception to "the browser never talks to
// Supabase directly" (see CLAUDE.md's frontend architecture note): Supabase's
// password-recovery flow requires the browser to hold the recovery session
// from the emailed link and call updateUser() directly — there's no way to
// proxy that through the httpOnly-cookie backend-for-frontend pattern used
// everywhere else. The anon key is meant to be public (RLS-protected).
export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      ),
    []
  );

  const [status, setStatus] = useState<"checking" | "ready" | "invalid" | "done">("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setStatus("ready");
    });

    // The recovery link may have already been consumed into a session by the
    // time this effect runs (detectSessionInUrl fires on client construction).
    supabase.auth.getSession().then(({ data }) => {
      setStatus((prev) => (prev === "checking" ? (data.session ? "ready" : "invalid") : prev));
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await supabase.auth.signOut();
    setStatus("done");
    setTimeout(() => router.push("/parent/login"), 2000);
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
        {status === "checking" && <p className="text-sm text-zinc-500">Verifying your reset link…</p>}

        {status === "invalid" && (
          <>
            <div className="mb-2 flex items-center gap-2 text-rose-600">
              <AlertCircle className="h-5 w-5" strokeWidth={2.2} />
              <h1 className="text-xl font-bold">Link expired or invalid</h1>
            </div>
            <p className="mb-5 text-sm text-zinc-500">Request a new password reset link and try again.</p>
            <Link
              href="/parent/forgot-password"
              className="block rounded-full bg-brand-500 py-2.5 text-center font-semibold text-white shadow-sm transition hover:bg-brand-600"
            >
              Request a new link
            </Link>
          </>
        )}

        {status === "done" && (
          <>
            <div className="mb-2 flex items-center gap-2 text-brand-700">
              <CheckCircle2 className="h-5 w-5" strokeWidth={2.2} />
              <h1 className="text-xl font-bold">Password updated</h1>
            </div>
            <p className="text-sm text-zinc-500">Taking you to the login page…</p>
          </>
        )}

        {status === "ready" && (
          <>
            <h1 className="mb-1 text-xl font-bold text-zinc-800">Choose a new password</h1>
            <p className="mb-6 text-sm text-zinc-500">Make it something you haven&apos;t used before.</p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <IconInput
                icon={Lock}
                type="password"
                required
                minLength={8}
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-zinc-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <IconInput
                icon={Lock}
                type="password"
                required
                minLength={8}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="border-zinc-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              {error && <p className="text-sm text-rose-500">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="mt-2 rounded-full bg-brand-500 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Updating..." : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
