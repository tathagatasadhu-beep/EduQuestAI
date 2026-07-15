"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle, Loader2, Search, Send, Sparkles } from "lucide-react";
import type { TutorChatMessage } from "@/lib/api";

const SUGGESTED_PROMPTS = [
  "Explain this topic simply",
  "Give me another example",
  "Why does this work?",
];

export default function TutorChat({
  subjectId,
  subjectName,
  initialPrompt,
}: {
  subjectId: string;
  subjectName: string;
  // Shown as a one-tap suggested prompt (e.g. "why did I get this wrong?")
  // instead of the generic ones — never auto-sent, so opening this panel
  // never costs an API call until the student actually taps something.
  initialPrompt?: string;
}) {
  const [messages, setMessages] = useState<TutorChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const history = messages;
    const nextMessages: TutorChatMessage[] = [...history, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_id: subjectId, message: trimmed, history }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "The tutor couldn't respond right now.");
        setMessages(history);
        return;
      }
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Couldn't reach the tutor — check your connection and try again.");
      setMessages(history);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border-2 border-sky-100 bg-white shadow-sm">
      <div className="max-h-[28rem] min-h-[16rem] flex-1 overflow-y-auto px-5 py-5">
        {messages.length === 0 ? (
          <div>
            <div className="mb-5 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-white">
                <Sparkles className="h-4.5 w-4.5" strokeWidth={2.2} />
              </span>
              <p className="font-semibold text-zinc-800">Ask me anything about {subjectName}!</p>
            </div>
            <div className="flex flex-col gap-2">
              {initialPrompt && (
                <button
                  onClick={() => send(initialPrompt)}
                  className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-2.5 text-left text-sm font-medium text-amber-700 transition hover:bg-amber-100"
                >
                  {initialPrompt}
                  <HelpCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" strokeWidth={2} />
                </button>
              )}
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => send(prompt)}
                  className="flex items-center justify-between rounded-xl bg-sky-50 px-4 py-2.5 text-left text-sm font-medium text-sky-700 transition hover:bg-sky-100"
                >
                  {prompt}
                  <Search className="h-3.5 w-3.5 shrink-0 text-sky-400" strokeWidth={2} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-sky-600 text-white"
                      : "bg-sky-50 text-zinc-700"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl bg-sky-50 px-4 py-2.5 text-sm text-sky-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {error && <p className="border-t border-sky-100 px-5 py-2 text-xs text-rose-500">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-sky-100 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything..."
          disabled={sending}
          className="flex-1 rounded-full border border-sky-200 px-4 py-2 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </form>
    </div>
  );
}
