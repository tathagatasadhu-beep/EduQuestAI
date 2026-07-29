"use client";

import { Check, X } from "lucide-react";

export type NavigatorItemState = "correct" | "incorrect" | "skipped" | "unanswered";

export type NavigatorItem = {
  id: string;
  label: string;
  state: NavigatorItemState;
};

const STATE_CLASSES: Record<NavigatorItemState, string> = {
  correct: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
  incorrect: "bg-rose-100 text-rose-700 hover:bg-rose-200",
  skipped: "bg-amber-100 text-amber-700 hover:bg-amber-200",
  unanswered: "bg-zinc-100 text-zinc-500 hover:bg-zinc-200",
};

// Shared "Your Score" + question-pill grid, used by both quiz flows
// (PracticeSessionRunner's pre-known fixed list, and QuizRunner's
// grows-as-served adaptive list) — extracted so a visual change only needs
// to happen in one place.
export default function QuestionNavigator({
  items,
  correctCount,
  totalCount,
  currentIndex,
  onSelect,
}: {
  items: NavigatorItem[];
  correctCount: number;
  totalCount: number;
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <aside className="w-full shrink-0 lg:w-48">
      <div className="mb-4 flex flex-col items-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-sky-500 text-sm font-bold text-sky-700">
          {correctCount}/{totalCount}
        </div>
        <p className="mt-1 text-center text-[10px] font-semibold tracking-wide text-sky-400 uppercase">
          Your Score
        </p>
      </div>
      <div className="grid grid-cols-5 gap-1.5 lg:grid-cols-4">
        {items.map((item, i) => {
          const isCurrent = i === currentIndex;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(i)}
              className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition ${
                isCurrent ? "ring-2 ring-sky-500 ring-offset-1" : ""
              } ${STATE_CLASSES[item.state]}`}
            >
              {item.state === "correct" && <Check className="h-3 w-3" strokeWidth={3} />}
              {item.state === "incorrect" && <X className="h-3 w-3" strokeWidth={3} />}
              {item.label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
