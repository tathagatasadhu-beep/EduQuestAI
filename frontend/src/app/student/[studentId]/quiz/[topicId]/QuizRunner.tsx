"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import QuestionCard from "@/components/QuestionCard";
import StreakBadge from "@/components/StreakBadge";
import XPBar, { levelForXp } from "@/components/XPBar";
import type { AttemptResult, QuestionOut } from "@/lib/api";

export default function QuizRunner({
  studentId,
  topicId,
  initialXpTotal,
  initialStreakDays,
}: {
  studentId: string;
  topicId: string;
  initialXpTotal: number;
  initialStreakDays: number;
}) {
  const [question, setQuestion] = useState<QuestionOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [xpTotal, setXpTotal] = useState(initialXpTotal);
  const [streakDays, setStreakDays] = useState(initialStreakDays);
  const [celebrating, setCelebrating] = useState(false);

  async function loadNext() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/quiz/next-question?topic_id=${topicId}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setQuestion(null);
      setError(data.error || "No more questions available in this topic right now.");
      return;
    }
    setQuestion(data);
    setQuestionNumber((n) => n + 1);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching on mount/topic change is intentional
    loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  async function handleSubmit(answer: string): Promise<AttemptResult> {
    const res = await fetch("/api/quiz/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId, question_id: question!.id, submitted_answer: answer }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Submit failed.");

    const result = data as AttemptResult;
    const leveledUp = levelForXp(result.xp_total) > levelForXp(xpTotal);
    setXpTotal(result.xp_total);
    setStreakDays(result.streak_days);
    if (leveledUp) {
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 900);
    }
    return result;
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-purple-100">
        <div className="flex-1">
          <XPBar xpTotal={xpTotal} celebrate={celebrating} />
        </div>
        <StreakBadge streakDays={streakDays} />
      </div>

      {loading && !question && (
        <p className="flex items-center justify-center gap-2 text-center text-purple-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading question...
        </p>
      )}
      {error && <p className="text-center text-rose-500">{error}</p>}
      {question && (
        <>
          <p className="mb-3 text-center text-sm font-medium text-purple-400">Question {questionNumber}</p>
          <QuestionCard question={question} onSubmit={handleSubmit} onNext={loadNext} />
        </>
      )}
    </div>
  );
}
