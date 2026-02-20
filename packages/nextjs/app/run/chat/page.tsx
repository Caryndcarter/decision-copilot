"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { DecisionRunResult, LensQuestion } from "@/types/decision";
import type { ClarificationAnswersMap } from "../clarification-form";
import { ResultContent } from "../result-content";
import { ResultChat } from "../result-chat";
import { ClarificationForm } from "../clarification-form";

const RUN_RESULT_KEY = "decisionRunResult";

function questionKey(q: { lens: string; question_id: string }) {
  return `${q.lens}-${q.question_id}`;
}

function formatAnswerDisplay(q: LensQuestion, value: string | number | boolean | undefined): string {
  if (value === undefined || value === null || value === "") return "—";
  if (q.answer_type === "boolean") {
    if (value === "unknown") return "Unknown";
    return value === true || value === "yes" ? "Yes" : "No";
  }
  if (q.answer_type === "percentage") return `${value}%`;
  if (typeof value === "number") return String(value);
  return String(value);
}

/** Read-only copy of the clarification form: same layout with questions + answers (right side unchanged after submit) */
function AnsweredQuestionsSidebar({
  questions,
  answers,
}: {
  questions: LensQuestion[];
  answers: ClarificationAnswersMap;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sticky top-6 border-sky-200 bg-sky-50/50">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Follow-up questions
      </h2>
      <p className="mt-1 mb-4 text-sm text-slate-600">
        The analysis on the left has been updated with your answers below.
      </p>
      <div className="space-y-4">
        {questions.map((q) => (
          <div key={questionKey(q)}>
            <p className="text-sm font-medium text-slate-700">{q.question_text}</p>
            <p className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800">
              {formatAnswerDisplay(q, answers[questionKey(q)])}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChatContent() {
  const searchParams = useSearchParams();
  const [result, setResult] = useState<DecisionRunResult | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Keep showing questions + answers on the right after user submits (right side unchanged, left refreshes) */
  const [lastClarificationQuestions, setLastClarificationQuestions] = useState<LensQuestion[] | null>(null);
  const [lastClarificationAnswers, setLastClarificationAnswers] = useState<ClarificationAnswersMap | null>(null);
  const prevRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    const run_id = searchParams.get("run_id");
    if (run_id?.trim()) {
      setLoadError(null);
      fetch(`/api/decision/run?run_id=${encodeURIComponent(run_id.trim())}`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            setLoadError(data.error || "Failed to load run");
            setMissing(true);
            return;
          }
          setResult(data as DecisionRunResult);
          if (typeof window !== "undefined") {
            sessionStorage.setItem(RUN_RESULT_KEY, JSON.stringify(data));
          }
        })
        .catch(() => {
          setLoadError("Failed to load run");
          setMissing(true);
        });
      return;
    }
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(RUN_RESULT_KEY);
    if (!raw) {
      setMissing(true);
      return;
    }
    try {
      const data = JSON.parse(raw) as DecisionRunResult;
      setResult(data);
    } catch {
      setMissing(true);
    }
  }, [searchParams]);

  // Persist questions (and answers after submit) for the right panel; clear only when switching to a different run that has none
  useEffect(() => {
    if (!result) return;
    const hasQuestions = result.clarification_questions && result.clarification_questions.length > 0;
    if (hasQuestions) {
      setLastClarificationQuestions(result.clarification_questions);
      prevRunIdRef.current = result.run_id;
    } else if (prevRunIdRef.current !== result.run_id) {
      setLastClarificationQuestions(null);
      setLastClarificationAnswers(null);
      prevRunIdRef.current = result.run_id;
    }
  }, [result]);

  const handleUpdatedResult = (
    updated: DecisionRunResult,
    submitted?: { questions: LensQuestion[]; answers: ClarificationAnswersMap }
  ) => {
    setResult(updated);
    if (submitted) {
      setLastClarificationQuestions(submitted.questions);
      setLastClarificationAnswers(submitted.answers);
    }
    if (typeof window !== "undefined") {
      sessionStorage.setItem(RUN_RESULT_KEY, JSON.stringify(updated));
    }
  };

  if (missing) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <h1 className="text-2xl font-semibold text-slate-900">Decision chat</h1>
          <p className="mt-4 text-slate-600">
            {loadError ?? "No run result in this session. Start from the intake form."}
          </p>
          <p className="mt-6">
            <Link href="/intake" className="text-sky-600 underline hover:text-sky-700">
              Go to intake →
            </Link>
          </p>
        </div>
      </main>
    );
  }

  if (result === null) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <p className="text-slate-600">Loading…</p>
        </div>
      </main>
    );
  }

  const hasPendingQuestions =
    result.clarification_needed &&
    result.clarification_questions &&
    result.clarification_questions.length > 0;
  const hasAnsweredSnapshot =
    lastClarificationQuestions &&
    lastClarificationQuestions.length > 0 &&
    lastClarificationAnswers &&
    Object.keys(lastClarificationAnswers).length > 0;
  const showRightPanel = hasPendingQuestions || hasAnsweredSnapshot;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Decision analysis</h1>
          <div className="flex items-center gap-4">
            <Link href={`/run/result${result.run_id ? `?run_id=${result.run_id}` : ""}`} className="text-sm text-slate-500 underline hover:text-slate-700">
              View single-page result
            </Link>
            <Link href="/intake" className="text-sm text-sky-600 underline hover:text-sky-700">
              New intake
            </Link>
          </div>
        </header>

        <div
          className={
            showRightPanel
              ? "grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]"
              : "max-w-3xl"
          }
        >
          {/* Left: result content + Q&A chat (refreshes when clarification is submitted) */}
          <div className="min-w-0">
            <ResultContent result={result} />
            <ResultChat runId={result.run_id} />
          </div>

          {/* Right: clarification form when there are questions; after submit, keep showing "Questions you answered" */}
          {showRightPanel && (
            <aside className="min-w-0 lg:max-w-[380px]">
              {hasPendingQuestions ? (
                <ClarificationForm
                  result={result}
                  onUpdatedResult={handleUpdatedResult}
                  variant="sidebar"
                />
              ) : lastClarificationQuestions && lastClarificationAnswers ? (
                <AnsweredQuestionsSidebar
                  questions={lastClarificationQuestions}
                  answers={lastClarificationAnswers}
                />
              ) : null}
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}

export default function RunChatPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50">
          <div className="mx-auto max-w-2xl px-6 py-12">
            <p className="text-slate-600">Loading…</p>
          </div>
        </main>
      }
    >
      <ChatContent />
    </Suspense>
  );
}
