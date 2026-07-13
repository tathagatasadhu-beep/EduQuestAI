import { Award, Lock } from "lucide-react";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { getStudentToken } from "@/lib/session";

export default async function BadgesPage() {
  const token = await getStudentToken();
  if (!token) redirect("/student/login");

  let badges: Awaited<ReturnType<typeof api.getMyBadges>>;
  try {
    badges = await api.getMyBadges(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) redirect("/student/login");
    throw err;
  }

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-zinc-800">
        <Award className="h-6 w-6 text-purple-500" strokeWidth={2.2} />
        Badges
      </h1>
      <p className="mb-6 text-sm text-zinc-500">
        {earnedCount} of {badges.length} earned
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {badges.map((b) => (
          <div
            key={b.id}
            className={`flex flex-col items-center gap-2 rounded-2xl border-2 px-4 py-6 text-center shadow-sm ${
              b.earned ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-zinc-50"
            }`}
          >
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl ${
                b.earned ? "bg-amber-100" : "bg-zinc-200"
              }`}
            >
              {b.earned ? "🏅" : <Lock className="h-5 w-5 text-zinc-400" strokeWidth={2} />}
            </span>
            <p className={`text-sm font-semibold ${b.earned ? "text-amber-800" : "text-zinc-500"}`}>{b.name}</p>
            <p className={`text-xs ${b.earned ? "text-amber-600" : "text-zinc-400"}`}>{b.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
