"use client";

import { useState } from "react";
import { BookmarkPlus, CheckCircle2, Loader2, XCircle } from "lucide-react";
import type { AttemptResult, QuestionOut } from "@/lib/api";

export default function QuestionCard({
  question,
  onSubmit,
  onNext,
}: {
  question: QuestionOut;
  onSubmit: (answer: string) => Promise<AttemptResult>;
  onNext: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMultipleChoice = question.question_type === "multiple_choice";
  const answered = result !== null;

  async function handleSubmit() {
    if (!answer || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await onSubmit(answer);
      setResult(res);
    } catch {
      setError("Couldn't submit that answer — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    setAnswer("");
    setResult(null);
    setError(null);
    onNext();
  }

  return (
    <div className="relative rounded-3xl bg-white p-6 shadow-lg ring-1 ring-purple-100">
      {answered && result.xp_awarded > 0 && (
        <span className="animate-float-up pointer-events-none absolute top-2 right-6 text-lg font-extrabold text-amber-500">
          +{result.xp_awarded} XP
        </span>
      )}

      <p className="mb-5 text-lg font-semibold text-zinc-800">{question.prompt_text}</p>

      {isMultipleChoice ? (
        <div className="flex flex-col gap-2">
          {question.options.map((opt) => {
            const label = opt.option_label ?? opt.option_text;
            const selected = answer === label;
            const isCorrectOption = answered && label.toLowerCase() === result.correct_answer.toLowerCase();
            const isWrongSelection = answered && selected && !result.is_correct;
            return (
              <button
                key={label}
                disabled={answered}
                onClick={() => setAnswer(label)}
                className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left font-medium transition
                  ${isCorrectOption ? "border-emerald-400 bg-emerald-50" : ""}
                  ${isWrongSelection ? "border-rose-300 bg-rose-50" : ""}
                  ${!answered && selected ? "border-purple-500 bg-purple-50" : ""}
                  ${!answered && !selected ? "border-zinc-200 hover:border-purple-300" : ""}
                  ${answered && !isCorrectOption && !isWrongSelection ? "border-zinc-100 opacity-60" : ""}
                  ${answered ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span>
                  <span className="mr-2 text-purple-500">{opt.option_label}</span>
                  {opt.option_text}
                </span>
                {isCorrectOption && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" strokeWidth={2.5} />}
                {isWrongSelection && <XCircle className="h-5 w-5 shrink-0 text-rose-500" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          type="text"
          disabled={answered}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Type your answer..."
          className="w-full rounded-xl border-2 border-zinc-200 px-4 py-3 font-medium focus:border-purple-400 focus:outline-none disabled:opacity-70"
        />
      )}

      {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}

      {!answered ? (
        <button
          onClick={handleSubmit}
          disabled={!answer || submitting}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-bold text-white transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Checking..." : "Submit Answer"}
        </button>
      ) : (
        <div className="mt-5">
          <div
            className={`flex items-start gap-2 rounded-xl px-4 py-3 font-semibold ${
              result.is_correct ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            }`}
          >
            {result.is_correct ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.5} />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.5} />
            )}
            <span>
              {result.is_correct ? "Correct! Nice work." : `Not quite — the answer was ${result.correct_answer}.`}
              {result.added_to_review_queue && (
                <span className="mt-1 flex items-center gap-1 text-xs font-normal text-rose-500">
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  Added to your review queue — you&apos;ll see this again soon.
                </span>
              )}
            </span>
          </div>
          <button
            onClick={handleNext}
            className="mt-3 w-full rounded-xl bg-zinc-800 py-3 font-bold text-white transition hover:bg-zinc-900"
          >
            Next Question →
          </button>
        </div>
      )}
    </div>
  );
}
