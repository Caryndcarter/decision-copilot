"use client";

import { useState, useRef, useEffect } from "react";
import type { LensQuestion } from "@/types/decision";
import type { ClarificationAnswersMap } from "./clarification-form";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const CHAT_STORAGE_PREFIX = "decisionRunChat_";

function getStoredChat(runId: string): ChatMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CHAT_STORAGE_PREFIX + runId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function setStoredChat(runId: string, messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CHAT_STORAGE_PREFIX + runId, JSON.stringify(messages));
  } catch {
    // ignore
  }
}

export interface ResultChatProps {
  runId: string;
  className?: string;
  /** When true, hide the "Ask about this analysis" header (e.g. inside a unified section) */
  hideHeader?: boolean;
  /** Initial messages when run was loaded by run_id (from API); sessionStorage overrides when present */
  initialMessages?: ChatMessage[];
  /** Current clarification Q&A so the AI can answer about the questions and the user's (possibly edited) answers */
  clarificationContext?: { questions: LensQuestion[]; answers: ClarificationAnswersMap };
}

export function ResultChat({ runId, className = "", hideHeader = false, initialMessages, clarificationContext }: ResultChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const stored = getStoredChat(runId);
    if (stored?.length) return stored;
    if (initialMessages?.length) return initialMessages;
    return [];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = getStoredChat(runId);
    if (stored?.length) {
      setMessages(stored);
      return;
    }
    if (initialMessages?.length) setMessages(initialMessages);
    else setMessages([]);
  }, [runId, initialMessages]);

  useEffect(() => {
    setStoredChat(runId, messages);
  }, [runId, messages]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const body: {
        run_id: string;
        messages: ChatMessage[];
        newMessage: string;
        clarification_questions?: LensQuestion[];
        clarification_answers?: ClarificationAnswersMap;
      } = {
        run_id: runId,
        messages: messages,
        newMessage: text,
      };
      if (clarificationContext?.questions?.length && clarificationContext.answers && Object.keys(clarificationContext.answers).length > 0) {
        body.clarification_questions = clarificationContext.questions;
        body.clarification_answers = clarificationContext.answers;
      }
      const res = await fetch("/api/decision/run/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.content }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={hideHeader ? className : `mt-8 ${className}`}>
      <div className={hideHeader ? "" : "rounded-lg border border-slate-200 bg-white shadow-sm"}>
        {!hideHeader && (
          <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
              Ask about this analysis
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Ask open-ended questions about the result; answers are based on your decision context and analysis.
            </p>
          </div>
        )}

        <div
          ref={messagesContainerRef}
          className="max-h-[420px] min-h-[200px] overflow-y-auto p-4"
        >
          {messages.length === 0 && !loading && (
            <p className="text-sm text-slate-500">
              Type a question below (e.g. &ldquo;What&apos;s the biggest risk?&rdquo; or &ldquo;How reversible is this?&rdquo;).
            </p>
          )}
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-sky-600 text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}
          </div>
          {loading && (
            <div className="mt-4 flex justify-start">
              <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-500">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" aria-hidden />
                <span className="ml-2">Thinking…</span>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4">
          {error && (
            <p className="mb-2 text-sm text-red-600">{error}</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about the analysis…"
              disabled={loading}
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60"
              aria-label="Question about the analysis"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-60"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
