import { Flame } from "lucide-react";

export default function StreakBadge({ streakDays }: { streakDays: number }) {
  if (streakDays <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-500">
        <Flame className="h-4 w-4" strokeWidth={2} />
        Start a streak today!
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-100 to-amber-100 px-3 py-1.5 text-sm font-bold text-orange-600 shadow-sm">
      <Flame className="animate-flame h-4 w-4 fill-orange-500 text-orange-500" strokeWidth={2} />
      {streakDays} day{streakDays === 1 ? "" : "s"}
    </span>
  );
}
