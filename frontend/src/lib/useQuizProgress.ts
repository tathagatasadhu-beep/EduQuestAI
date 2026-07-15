"use client";

import { useState } from "react";
import type { AttemptResult } from "@/lib/api";
import { levelForXp } from "@/components/XPBar";

export function useQuizProgress(initialXpTotal: number, initialStreakDays: number) {
  const [xpTotal, setXpTotal] = useState(initialXpTotal);
  const [streakDays, setStreakDays] = useState(initialStreakDays);
  const [celebrating, setCelebrating] = useState(false);

  function applyResult(result: AttemptResult) {
    const leveledUp = levelForXp(result.xp_total) > levelForXp(xpTotal);
    setXpTotal(result.xp_total);
    setStreakDays(result.streak_days);
    if (leveledUp) {
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 900);
    }
  }

  return { xpTotal, streakDays, celebrating, applyResult };
}

export async function submitAnswer(
  studentId: string,
  questionId: string,
  answer: string,
  selfReportedCorrect?: boolean
): Promise<AttemptResult> {
  const res = await fetch("/api/quiz/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      student_id: studentId,
      question_id: questionId,
      submitted_answer: answer,
      ...(selfReportedCorrect !== undefined ? { self_reported_correct: selfReportedCorrect } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Submit failed.");
  return data as AttemptResult;
}

export async function revealAnswer(questionId: string): Promise<string> {
  const res = await fetch(`/api/quiz/reveal?question_id=${questionId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Reveal failed.");
  return data.correct_answer as string;
}
