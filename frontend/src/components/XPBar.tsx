import { Star } from "lucide-react";

const XP_PER_LEVEL = 500;

export function levelForXp(xpTotal: number) {
  return Math.floor(xpTotal / XP_PER_LEVEL) + 1;
}

export default function XPBar({ xpTotal, celebrate = false }: { xpTotal: number; celebrate?: boolean }) {
  const level = levelForXp(xpTotal);
  const progress = xpTotal % XP_PER_LEVEL;
  const percent = Math.round((progress / XP_PER_LEVEL) * 100);

  return (
    <div className={`w-full ${celebrate ? "animate-celebrate" : ""}`}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-sm font-bold text-sky-700">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" strokeWidth={2.5} />
          Level {level}
        </span>
        <span className="text-xs font-medium text-sky-400">
          {progress} / {XP_PER_LEVEL} XP
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-sky-100 shadow-inner">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-sky-500 transition-all duration-700 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
