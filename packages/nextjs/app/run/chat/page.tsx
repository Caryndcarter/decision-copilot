"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { DecisionRunResult, LensQuestion } from "@/types/decision";
import type { ClarificationAnswersMap } from "../clarification-form";
import { ResultContent } from "../result-content";
import { ResultChat } from "../result-chat";
import { ClarificationForm } from "../clarification-form";
import { ClarificationAnswerEditor } from "../clarification-answer-editor";

const RUN_RESULT_KEY = "decisionRunResult";
const CLARIFICATION_SNAPSHOT_KEY = "decisionRunClarificationSnapshot";

function getStoredSnapshot(run_id: string): { questions: LensQuestion[]; answers: ClarificationAnswersMap } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CLARIFICATION_SNAPSHOT_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, { questions: LensQuestion[]; answers: ClarificationAnswersMap }>;
    return map[run_id] ?? null;
  } catch {
    return null;
  }
}

function setStoredSnapshot(run_id: string, questions: LensQuestion[], answers: ClarificationAnswersMap) {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(CLARIFICATION_SNAPSHOT_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, { questions: LensQuestion[]; answers: ClarificationAnswersMap }>) : {};
    map[run_id] = { questions, answers };
    sessionStorage.setItem(CLARIFICATION_SNAPSHOT_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

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

/** Clarification answers: always inline editable (Tiptap for short_text, inputs for others). Saves on change/blur via onSave (parent persists to state + sessionStorage). */
function AnsweredQuestionsSidebar({
  questions,
  answers,
  embedded = false,
  onSave,
}: {
  questions: LensQuestion[];
  answers: ClarificationAnswersMap;
  embedded?: boolean;
  onSave?: (answers: ClarificationAnswersMap) => void;
}) {
  const [draftAnswers, setDraftAnswers] = useState<ClarificationAnswersMap>({ ...answers });

  useEffect(() => {
    setDraftAnswers({ ...answers });
  }, [answers]);

  const persist = (next: ClarificationAnswersMap) => {
    setDraftAnswers(next);
    onSave?.(next);
  };

  const wrapperClass = embedded ? "pt-0" : "rounded-lg border border-slate-200 bg-white p-4 shadow-sm border-sky-200 bg-sky-50/50";

  return (
    <div className={wrapperClass}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Follow-up questions
      </h2>
      <p className="mt-1 mb-4 text-sm text-slate-600">
        The analysis on the left has been updated with your answers below. Edit inline; changes save when you click away.
      </p>
      <div className="space-y-4">
        {questions.map((q) => (
          <div key={questionKey(q)}>
            <label htmlFor={questionKey(q)} className="block text-sm font-medium text-slate-700">
              {q.question_text}
            </label>
            {q.answer_type === "enum" && q.options && q.options.length > 0 ? (
              <select
                id={questionKey(q)}
                value={String(draftAnswers[questionKey(q)] ?? "")}
                onChange={(e) => {
                  const next = { ...draftAnswers, [questionKey(q)]: e.target.value };
                  persist(next);
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">Select…</option>
                {q.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : q.answer_type === "boolean" ? (
              <select
                id={questionKey(q)}
                value={
                  draftAnswers[questionKey(q)] === true
                    ? "yes"
                    : draftAnswers[questionKey(q)] === false
                      ? "no"
                      : draftAnswers[questionKey(q)] === "unknown"
                        ? "unknown"
                        : ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  const val = v === "yes" ? true : v === "no" ? false : v === "unknown" ? "unknown" : "";
                  persist({ ...draftAnswers, [questionKey(q)]: val });
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">Select…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="unknown">Unknown</option>
              </select>
            ) : q.answer_type === "numeric" ? (
              <input
                id={questionKey(q)}
                type="number"
                value={
                  draftAnswers[questionKey(q)] !== undefined
                    ? String(draftAnswers[questionKey(q)])
                    : ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  persist({ ...draftAnswers, [questionKey(q)]: v === "" ? 0 : Number(v) });
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            ) : q.answer_type === "percentage" ? (
              <div className="flex items-center gap-2">
                <input
                  id={questionKey(q)}
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={
                    draftAnswers[questionKey(q)] !== undefined
                      ? String(draftAnswers[questionKey(q)])
                      : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    persist({ ...draftAnswers, [questionKey(q)]: v === "" ? 0 : Number(v) });
                  }}
                  placeholder="0–100"
                  className="mt-1 w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <span className="text-slate-500">%</span>
              </div>
            ) : (
              <div className="mt-1">
                <ClarificationAnswerEditor
                  editorKey={`clarification-${questionKey(q)}`}
                  value={String(draftAnswers[questionKey(q)] ?? "")}
                  onChange={(value) => persist({ ...draftAnswers, [questionKey(q)]: value })}
                />
              </div>
            )}
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

  // Persist questions (and answers after submit) for the right panel; restore from sessionStorage when returning to chat (e.g. from single-page result)
  useEffect(() => {
    if (!result) return;
    const hasQuestions = result.clarification_questions && result.clarification_questions.length > 0;
    if (hasQuestions) {
      setLastClarificationQuestions(result.clarification_questions);
      prevRunIdRef.current = result.run_id;
    } else {
      if (prevRunIdRef.current !== result.run_id) {
        prevRunIdRef.current = result.run_id;
      }
      const snapshot = getStoredSnapshot(result.run_id);
      if (snapshot?.questions?.length && snapshot.answers && Object.keys(snapshot.answers).length > 0) {
        setLastClarificationQuestions(snapshot.questions);
        setLastClarificationAnswers(snapshot.answers);
      } else {
        setLastClarificationQuestions(null);
        setLastClarificationAnswers(null);
      }
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
      setStoredSnapshot(updated.run_id, submitted.questions, submitted.answers);
    }
    if (typeof window !== "undefined") {
      sessionStorage.setItem(RUN_RESULT_KEY, JSON.stringify(updated));
    }
  };

  if (missing) {
    return (
      <main className="min-h-screen bg-slate-50">
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-6 py-4">
            <h1 className="text-xl font-semibold text-slate-900">Decision analysis</h1>
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-6 py-12">
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
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto max-w-7xl px-6 py-4">
            <h1 className="text-xl font-semibold text-slate-900">Decision analysis</h1>
          </div>
        </header>
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

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Decision analysis</h1>
          <div className="flex items-center gap-4">
            <Link href={`/run/result${result.run_id ? `?run_id=${result.run_id}` : ""}`} className="text-sm text-slate-500 underline hover:text-slate-700">
              View single-page result
            </Link>
            <Link href="/intake" className="text-sm text-sky-600 underline hover:text-sky-700">
              New intake
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Left: analysis only. Right: one chat-like section (clarification + open-ended chat). */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            <ResultContent
              result={result}
              onRunUpdate={(updated) => {
                setResult(updated);
                if (typeof window !== "undefined") {
                  sessionStorage.setItem(RUN_RESULT_KEY, JSON.stringify(updated));
                }
              }}
            />
          </div>

          <aside className="min-w-0 lg:max-w-[380px]">
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
                <h2 className="text-base font-semibold text-slate-800">Discuss & clarify</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Answer the follow-up questions below to refine the analysis. You can also use the chat at any time—including to ask about the questions themselves.
                </p>
              </div>
              <div className="p-4 space-y-6">
                {hasPendingQuestions ? (
                  <ClarificationForm
                    result={result}
                    onUpdatedResult={handleUpdatedResult}
                    variant="sidebar"
                    embedded
                  />
                ) : lastClarificationQuestions && lastClarificationAnswers ? (
                  <AnsweredQuestionsSidebar
                    questions={lastClarificationQuestions}
                    answers={lastClarificationAnswers}
                    embedded
                    onSave={(newAnswers) => {
                      setLastClarificationAnswers(newAnswers);
                      if (lastClarificationQuestions?.length) {
                        setStoredSnapshot(result.run_id, lastClarificationQuestions, newAnswers);
                      }
                    }}
                  />
                ) : null}

                <div className={hasPendingQuestions || hasAnsweredSnapshot ? "border-t border-slate-200 pt-4" : ""}>
                  <ResultChat
                  runId={result.run_id}
                  hideHeader
                  initialMessages={result.chat_messages}
                  clarificationContext={
                    lastClarificationQuestions?.length && lastClarificationAnswers && Object.keys(lastClarificationAnswers).length > 0
                      ? { questions: lastClarificationQuestions, answers: lastClarificationAnswers }
                      : undefined
                  }
                />
                </div>
              </div>
            </div>
          </aside>
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
          <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
            <div className="mx-auto max-w-7xl px-6 py-4">
              <h1 className="text-xl font-semibold text-slate-900">Decision analysis</h1>
            </div>
          </header>
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
