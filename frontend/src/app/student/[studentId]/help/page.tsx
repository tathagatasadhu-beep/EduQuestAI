import { Award, BookOpen, Dumbbell, Flame, HelpCircle, Star } from "lucide-react";

const FAQS = [
  {
    icon: BookOpen,
    question: "What's in My Subjects?",
    answer:
      "Every subject a parent has assigned you. Open one to chat with your AI tutor about it, then practice questions on any topic.",
  },
  {
    icon: Dumbbell,
    question: "How is Practice different from My Subjects?",
    answer: "Practice is a shortcut straight to questions on any topic you've been assigned — no chatting first, just go.",
  },
  {
    icon: Star,
    question: "How do XP and levels work?",
    answer: "You earn XP for every correct answer, plus a bonus for fixing a question you missed before. Every 500 XP is a new level.",
  },
  {
    icon: Flame,
    question: "How do streaks work?",
    answer: "Practice at least once a day to keep your streak going. Miss a day and it resets — so try to check in daily!",
  },
  {
    icon: Award,
    question: "How do I earn badges?",
    answer: "Badges unlock automatically as you practice — for streaks, mastering topics, and leveling up. Check the Badge tab to see them all.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-zinc-800">
        <HelpCircle className="h-6 w-6 text-purple-500" strokeWidth={2.2} />
        Help
      </h1>
      <p className="mb-6 text-sm text-zinc-500">Not sure how something works? Here&apos;s a quick guide.</p>

      <div className="flex flex-col gap-3">
        {FAQS.map(({ icon: Icon, question, answer }) => (
          <div key={question} className="rounded-2xl border-2 border-purple-100 bg-white p-4 shadow-sm">
            <div className="mb-1.5 flex items-center gap-2">
              <Icon className="h-4 w-4 text-purple-500" strokeWidth={2.2} />
              <p className="font-semibold text-zinc-800">{question}</p>
            </div>
            <p className="text-sm text-zinc-500">{answer}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-sm text-zinc-400">Still stuck? Ask a parent for help!</p>
    </div>
  );
}
