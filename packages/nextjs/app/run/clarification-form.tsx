"use client";

import { useState, useEffect } from "react";
import type { DecisionRunResult, LensQuestion } from "@/types/decision";

type ClarificationAnswers = Record<string, string | number | boolean>;

function questionKey(q: { lens: string; question_id: string }) {
  return `${q.lens}-${q.question_id}`;
}

const CLARIFICATION_SUBMITTING_STEPS = [
  "Updating risk analysis…",
  "Updating reversibility…",
  "Updating stakeholder impact…",
  "Preparing your recommendation…",
];

export interface ClarificationFormProps {
  result: DecisionRunResult;
  onUpdatedResult: (updated: DecisionRunResult) => void;
  /** Optional: compact/sidebar layout (e.g. for chat page) */
  variant?: "default" | "sidebar";
}

function Section({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function ClarificationForm({
  result,
  onUpdatedResult,
  variant = "default",
}: ClarificationFormProps) {
  const [clarificationAnswers, setClarificationAnswers] = useState<ClarificationAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittingStep, setSubmittingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const questions = result.clarification_questions ?? [];
  if (questions.length === 0) return null;

  useEffect(() => {
    if (!submitting) return;
    const interval = setInterval(() => {
      setSubmittingStep((prev) => (prev + 1) % CLARIFICATION_SUBMITTING_STEPS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [submitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmittingStep(0);
    setSubmitting(true);
    try {
      const answers = questions.map((q: LensQuestion) => {
        const raw = clarificationAnswers[questionKey(q)];
        let answer: string | number | boolean;
        if (q.answer_type === "boolean") {
          if (raw === "unknown" || raw === null || raw === undefined) {
            answer = "unknown";
          } else {
            answer = raw === true || raw === "true" || raw === "yes";
          }
        } else if (q.answer_type === "numeric" || q.answer_type === "percentage") {
          answer = typeof raw === "number" ? raw : Number(raw) ?? 0;
        } else {
          answer = typeof raw === "string" ? raw : String(raw ?? "");
        }
        return {
          question_id: q.question_id,
          lens: q.lens,
          answer,
          answer_type: q.answer_type,
        };
      });
      const res = await fetch("/api/decision/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "clarification",
          decision_id: result.decision_id,
          run_id: result.run_id,
          clarification: { clarification_round: 1, answers },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        return;
      }
      onUpdatedResult(data as DecisionRunResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const isSidebar = variant === "sidebar";

  return (
    <Card className={isSidebar ? "border-sky-200 bg-sky-50/50 sticky top-6" : "mt-6 border-sky-200 bg-sky-50/50"}>
      <Section title="Follow-up questions">
        <p className="mb-4 text-sm text-slate-600">
          Answer these to refine the analysis. We'll re-run and show an updated result.
        </p>
        <div className="mb-4 rounded-md border-2 border-dashed border-violet-300 bg-violet-50/50 p-3">
          <div className="flex items-center gap-2">
            <span className="rounded bg-violet-200 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-700">
              Demo
            </span>
            <span className="text-sm text-violet-700">Quick-fill for testing</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const samples: ClarificationAnswers = {};
                questions.forEach((q) => {
                  const key = questionKey(q);
                  if (q.answer_type === "boolean") samples[key] = true;
                  else if (q.answer_type === "percentage") samples[key] = 50;
                  else if (q.answer_type === "numeric") samples[key] = 5;
                  else if (q.answer_type === "enum" && q.options?.length) samples[key] = q.options[0];
                  else samples[key] = "Moderate impact expected. Need more data to assess fully.";
                });
                setClarificationAnswers(samples);
              }}
              className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100"
            >
              Fill sample answers
            </button>
            <button
              type="button"
              onClick={() => {
                const unknowns: ClarificationAnswers = {};
                questions.forEach((q) => {
                  const key = questionKey(q);
                  if (q.answer_type === "boolean") unknowns[key] = "unknown";
                  else if (q.answer_type === "percentage" || q.answer_type === "numeric") unknowns[key] = 0;
                  else if (q.answer_type === "enum" && q.options?.length)
                    unknowns[key] = q.options[q.options.length - 1];
                  else unknowns[key] = "Unknown";
                });
                setClarificationAnswers(unknowns);
              }}
              className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100"
            >
              Mark all unknown
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {questions.map((q) => (
            <div key={questionKey(q)}>
              <label htmlFor={questionKey(q)} className="block text-sm font-medium text-slate-700">
                {q.question_text}
                {q.required && <span className="text-red-500"> *</span>}
              </label>
              {q.answer_type === "enum" && q.options && q.options.length > 0 ? (
                <select
                  id={questionKey(q)}
                  required={q.required}
                  value={String(clarificationAnswers[questionKey(q)] ?? "")}
                  onChange={(e) =>
                    setClarificationAnswers((prev) => ({ ...prev, [questionKey(q)]: e.target.value }))
                  }
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
                  required={q.required}
                  value={
                    clarificationAnswers[questionKey(q)] === true
                      ? "yes"
                      : clarificationAnswers[questionKey(q)] === false
                        ? "no"
                        : clarificationAnswers[questionKey(q)] === "unknown"
                          ? "unknown"
                          : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    setClarificationAnswers((prev) => ({
                      ...prev,
                      [questionKey(q)]:
                        v === "yes" ? true : v === "no" ? false : v === "unknown" ? "unknown" : "",
                    }));
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
                  required={q.required}
                  value={
                    clarificationAnswers[questionKey(q)] !== undefined
                      ? String(clarificationAnswers[questionKey(q)])
                      : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    setClarificationAnswers((prev) => ({
                      ...prev,
                      [questionKey(q)]: v === "" ? 0 : Number(v),
                    }));
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
                    required={q.required}
                    value={
                      clarificationAnswers[questionKey(q)] !== undefined
                        ? String(clarificationAnswers[questionKey(q)])
                        : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      setClarificationAnswers((prev) => ({
                        ...prev,
                        [questionKey(q)]: v === "" ? 0 : Number(v),
                      }));
                    }}
                    placeholder="0–100"
                    className="mt-1 w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <span className="text-slate-500">%</span>
                </div>
              ) : (
                <input
                  id={questionKey(q)}
                  type="text"
                  required={q.required}
                  value={String(clarificationAnswers[questionKey(q)] ?? "")}
                  onChange={(e) =>
                    setClarificationAnswers((prev) => ({ ...prev, [questionKey(q)]: e.target.value }))
                  }
                  placeholder="Your answer"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              )}
            </div>
          ))}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {submitting && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              <p className="font-medium">{CLARIFICATION_SUBMITTING_STEPS[submittingStep]}</p>
              <p className="mt-1 text-sky-600">This usually takes 5–15 seconds.</p>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                  aria-hidden
                />
                {CLARIFICATION_SUBMITTING_STEPS[submittingStep]}
              </>
            ) : (
              "Submit answers & refresh analysis"
            )}
          </button>
        </form>
      </Section>
    </Card>
  );
}
