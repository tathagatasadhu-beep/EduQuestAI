"use client";

import { Fragment, useRef, useState } from "react";
import { BookmarkPlus, CheckCircle2, Loader2, MessageCircleQuestion, XCircle } from "lucide-react";
import type { AttemptResult, QuestionOut } from "@/lib/api";
import MathKeyboard, { type MathToken } from "@/components/MathKeyboard";
import TutorChat from "@/components/TutorChat";

// Fill-in-the-blank questions ("Which choice completes the text...") carry
// their blank as a run of underscores straight from the worksheet — render
// it as a visible blank line instead of tiny/cramped underscore characters.
const BLANK_PATTERN = /_{3,}/g;

function renderPromptText(text: string) {
  const parts = text.split(BLANK_PATTERN);
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && (
        <span className="mx-1 inline-block w-16 border-b-[3px] border-zinc-500 align-middle" aria-hidden="true" />
      )}
    </Fragment>
  ));
}

export default function QuestionCard({
  question,
  onSubmit,
  onReveal,
  onNext,
}: {
  question: QuestionOut;
  onSubmit: (answer: string, selfReportedCorrect?: boolean) => Promise<AttemptResult>;
  // Free-response only — looks up the correct answer without grading, so the
  // student can self-report whether they got it right (see below for why).
  onReveal: () => Promise<string>;
  onNext: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealedAnswer, setRevealedAnswer] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isMultipleChoice = question.question_type === "multiple_choice";
  // Only proof/open-ended free-response questions (no single checkable
  // answer) use the reveal + self-report flow — everything else, including
  // most free-response questions, auto-grades on submit like multiple_choice.
  const usesSelfAssessment = question.question_type === "free_response" && question.requires_self_assessment;
  const answered = result !== null;

  function handleInsert(token: MathToken) {
    const el = inputRef.current;
    const next = token.replace
      ? token.insert
      : answer.slice(0, el?.selectionStart ?? answer.length) + token.insert + answer.slice(el?.selectionEnd ?? answer.length);
    const cursor = token.replace
      ? next.length
      : (el?.selectionStart ?? answer.length) + (token.cursorOffset ?? token.insert.length);

    // Write to the DOM node directly (synchronously, no rAF) before calling setAnswer:
    // React's controlled-input reconciler skips re-assigning `.value` when it already
    // matches the DOM, so this lets our setSelectionRange survive the next render
    // instead of racing it.
    if (el) {
      el.focus();
      el.value = next;
      el.setSelectionRange(cursor, cursor);
    }
    setAnswer(next);
  }

  async function handleSubmit(selfReportedCorrect?: boolean) {
    if (!answer || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await onSubmit(answer, selfReportedCorrect);
      setResult(res);
    } catch {
      setError("Couldn't submit that answer — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReveal() {
    if (!answer || revealing) return;
    setRevealing(true);
    setError(null);
    try {
      const correctAnswer = await onReveal();
      setRevealedAnswer(correctAnswer);
    } catch {
      setError("Couldn't reveal the answer — try again.");
    } finally {
      setRevealing(false);
    }
  }

  function handleNext() {
    setAnswer("");
    setResult(null);
    setError(null);
    setRevealedAnswer(null);
    setKeyboardOpen(false);
    onNext();
  }

  return (
    <div className="relative rounded-3xl bg-white p-6 shadow-lg ring-1 ring-sky-100">
      {answered && result.xp_awarded > 0 && (
        <span className="animate-float-up pointer-events-none absolute top-2 right-6 text-lg font-extrabold text-amber-500">
          +{result.xp_awarded} XP
        </span>
      )}

      {question.image_path && (
        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a static/local asset next/image can optimize
        <img
          src={question.image_path}
          alt="Question diagram"
          className="mb-4 max-h-64 w-full rounded-xl object-contain ring-1 ring-sky-100"
        />
      )}

      <p className="mb-5 whitespace-pre-wrap text-lg font-semibold text-zinc-800">{renderPromptText(question.prompt_text)}</p>

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
                  ${!answered && selected ? "border-sky-500 bg-sky-50" : ""}
                  ${!answered && !selected ? "border-zinc-200 hover:border-sky-300" : ""}
                  ${answered && !isCorrectOption && !isWrongSelection ? "border-zinc-100 opacity-60" : ""}
                  ${answered ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span>
                  <span className="mr-2 text-sky-500">{opt.option_label}</span>
                  {opt.option_text}
                </span>
                {isCorrectOption && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" strokeWidth={2.5} />}
                {isWrongSelection && <XCircle className="h-5 w-5 shrink-0 text-rose-500" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="text"
            disabled={answered || revealedAnswer !== null}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onFocus={() => setKeyboardOpen(true)}
            placeholder="Type your answer..."
            className="w-full rounded-xl border-2 border-zinc-200 px-4 py-3 font-medium focus:border-sky-400 focus:outline-none disabled:opacity-70"
          />
          {!answered && revealedAnswer === null && (
            <MathKeyboard open={keyboardOpen} onOpenChange={setKeyboardOpen} onInsert={handleInsert} />
          )}
        </>
      )}

      {error && <p className="mt-3 text-sm text-rose-500">{error}</p>}

      {!answered && revealedAnswer !== null ? (
        <div className="mt-5 rounded-xl bg-sky-50 px-4 py-3">
          <p className="mb-3 text-sm text-zinc-700">
            The correct answer was: <span className="font-bold text-zinc-900">{revealedAnswer}</span>
          </p>
          <p className="mb-2 text-sm font-semibold text-zinc-700">Did you get it right?</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleSubmit(true)}
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />}
              Yes, I got it
            </button>
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-rose-500 py-2.5 font-bold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" strokeWidth={2.5} />}
              No, I missed it
            </button>
          </div>
        </div>
      ) : !answered ? (
        <button
          onClick={() => (usesSelfAssessment ? handleReveal() : handleSubmit())}
          disabled={!answer || submitting || revealing}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {(submitting || revealing) && <Loader2 className="h-4 w-4 animate-spin" />}
          {usesSelfAssessment
            ? revealing
              ? "Checking..."
              : "Show Answer"
            : submitting
              ? "Checking..."
              : "Submit Answer"}
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

          {!result.is_correct && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-700">
                <MessageCircleQuestion className="h-4 w-4 text-sky-500" strokeWidth={2.2} />
                Ask the AI tutor why
              </p>
              <TutorChat
                subjectId={question.subject_id}
                subjectName={question.subject_name}
                initialPrompt={`Why is the answer to "${question.prompt_text}" "${result.correct_answer}"?`}
              />
            </div>
          )}

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
