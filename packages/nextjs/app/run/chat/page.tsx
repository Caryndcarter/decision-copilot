"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { DecisionRunResult, LensQuestion, Posture } from "@/types/decision";
import type { ClarificationAnswersMap } from "../clarification-form";
import { ResultContent } from "../result-content";
import { ResultChat } from "../result-chat";
import { ClarificationForm } from "../clarification-form";
import { ClarificationAnswerEditor } from "../clarification-answer-editor";

const RUN_RESULT_KEY = "decisionRunResult";
const CLARIFICATION_SNAPSHOT_KEY = "decisionRunClarificationSnapshot";

const POSTURE_LABELS: Record<string, string> = {
  explore: "Explore",
  pressure_test: "Pressure test",
  surface_risks: "Surface risks",
  generate_alternatives: "Generate alternatives",
};

function postureLabel(posture: string): string {
  return POSTURE_LABELS[posture] ?? posture.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function runLabel(r: DecisionRunResult): string {
  const provider = r.llm_provider === "anthropic" ? "Anthropic" : "OpenAI";
  return `${postureLabel(r.intake.posture)} — ${provider}`;
}

const POSTURES: Posture[] = ["explore", "pressure_test", "surface_risks", "generate_alternatives"];

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

type ClarificationSection = { postureLabel: string; keys: string[] };

/** Clarification answers: always inline editable (Tiptap for short_text, inputs for others). Saves on change/blur via onSave (parent persists to state + sessionStorage). */
function AnsweredQuestionsSidebar({
  questions,
  answers,
  sections = [],
  embedded = false,
  onSave,
}: {
  questions: LensQuestion[];
  answers: ClarificationAnswersMap;
  sections?: ClarificationSection[];
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
  const questionsByKey = new Map(questions.map((q) => [questionKey(q), q]));

  const renderOne = (q: LensQuestion) => (
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
  );

  return (
    <div className={wrapperClass}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Follow-up questions
      </h2>
      <p className="mt-1 mb-4 text-sm text-slate-600">
        The analysis on the left has been updated with your answers below. Edit inline; changes save when you click away.
      </p>
      <div className="space-y-4">
        {sections.length > 0
          ? sections.map((section, idx) => {
              const sectionQuestions = section.keys
                .map((k) => questionsByKey.get(k))
                .filter((q): q is LensQuestion => q != null);
              if (sectionQuestions.length === 0) return null;
              return (
                <div key={`${section.postureLabel}-${idx}`} className={idx > 0 ? "mt-6 space-y-4" : "space-y-4"}>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    {section.postureLabel}
                  </h3>
                  {sectionQuestions.map((q) => renderOne(q))}
                </div>
              );
            })
          : questions.map((q) => renderOne(q))}
      </div>
    </div>
  );
}

function RunWithDifferentAIButton({
  result,
  onRerun,
}: {
  result: DecisionRunResult;
  onRerun: (newRunId: string) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const otherProvider = result.llm_provider === "anthropic" ? "openai" : "anthropic";
  const otherLabel = otherProvider === "anthropic" ? "Anthropic" : "OpenAI";

  async function handleRerun() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/decision/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "rerun_provider", run_id: result.run_id, llm_provider: otherProvider }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to run");
        return;
      }
      setShowModal(false);
      onRerun((data as DecisionRunResult).run_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
      >
        Run with different AI
      </button>
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" aria-hidden onClick={() => !submitting && setShowModal(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Run with different AI</h2>
            <p className="mt-1 text-sm text-slate-600">
              Re-run the same analysis (same posture and clarifications) using {otherLabel} instead of{" "}
              {result.llm_provider === "anthropic" ? "Anthropic" : "OpenAI"}.
            </p>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !submitting && setShowModal(false)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRerun}
                disabled={submitting}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {submitting ? "Running…" : `Run with ${otherLabel}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [result, setResult] = useState<DecisionRunResult | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Keep showing questions + answers on the right after user submits (right side unchanged, left refreshes) */
  const [lastClarificationQuestions, setLastClarificationQuestions] = useState<LensQuestion[] | null>(null);
  const [lastClarificationAnswers, setLastClarificationAnswers] = useState<ClarificationAnswersMap | null>(null);
  const prevRunIdRef = useRef<string | null>(null);
  /** All runs for this decision (for posture dropdown) */
  const [otherRuns, setOtherRuns] = useState<DecisionRunResult[]>([]);
  const [postureDropdownOpen, setPostureDropdownOpen] = useState(false);
  const [showRerunModal, setShowRerunModal] = useState(false);
  const [rerunPosture, setRerunPosture] = useState<Posture>("explore");
  const [rerunLeaningDirection, setRerunLeaningDirection] = useState("");
  const [rerunSubmitting, setRerunSubmitting] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const [canSwitchProvider, setCanSwitchProvider] = useState(false);

  useEffect(() => {
    fetch("/api/decision/providers")
      .then((res) => res.json())
      .then((data: { providers?: string[] }) => {
        const list = Array.isArray(data?.providers) ? data.providers : [];
        setCanSwitchProvider(list.includes("openai") && list.includes("anthropic"));
      })
      .catch(() => setCanSwitchProvider(false));
  }, []);

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

  // When opening rerun modal, default to first available (not-yet-run) posture
  useEffect(() => {
    if (showRerunModal && result) {
      const posturesRun = new Set((otherRuns.length > 0 ? otherRuns : [result]).map((r) => r.intake.posture));
      const available = POSTURES.filter((p) => !posturesRun.has(p));
      if (available[0]) setRerunPosture(available[0]);
      setRerunLeaningDirection("");
      setRerunError(null);
    }
  }, [showRerunModal, result?.intake.posture, otherRuns]);

  // Fetch all runs for this decision (for posture switcher dropdown). Refetch when run_id changes so new runs (e.g. after rerun) appear.
  useEffect(() => {
    if (!result?.decision_id) return;
    fetch(`/api/decision/run?decision_id=${encodeURIComponent(result.decision_id)}`)
      .then(async (res) => {
        const data = await res.json();
        if (res.ok && Array.isArray(data.runs)) setOtherRuns(data.runs);
        else setOtherRuns([]);
      })
      .catch(() => setOtherRuns([]));
  }, [result?.decision_id, result?.run_id]);

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

  // Always include current run in dropdown; merge in if missing (e.g. freshly created run not yet in list)
  const runsList = otherRuns.length > 0 ? otherRuns : (result ? [result] : []);
  const hasCurrent = result && runsList.some((r) => r.run_id === result.run_id);
  const runsForDropdown = hasCurrent ? runsList : result ? [result, ...runsList] : runsList;
  const currentRunLabel = runLabel(result);
  const posturesAlreadyRun = new Set(runsForDropdown.map((r) => r.intake.posture));
  const availablePostures = POSTURES.filter((p) => !posturesAlreadyRun.has(p));

  async function handleRerunPosture() {
    if (!result) return;
    if (rerunPosture === "pressure_test" && !rerunLeaningDirection.trim()) {
      setRerunError("Leaning direction is required for Pressure test");
      return;
    }
    setRerunError(null);
    setRerunSubmitting(true);
    try {
      const res = await fetch("/api/decision/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "rerun_posture",
          run_id: result.run_id,
          posture: rerunPosture,
          ...(rerunPosture === "pressure_test" && { leaning_direction: rerunLeaningDirection.trim() }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRerunError(data.error || "Failed to run");
        return;
      }
      setShowRerunModal(false);
      setRerunLeaningDirection("");
      router.push(`/run/chat?run_id=${(data as DecisionRunResult).run_id}`);
    } catch (err) {
      setRerunError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRerunSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-semibold text-slate-900">
            Decision analysis <span className="font-medium text-slate-600">— {currentRunLabel}</span>
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Run switcher (posture + provider) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setPostureDropdownOpen((o) => !o)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
                aria-expanded={postureDropdownOpen}
                aria-haspopup="listbox"
              >
                {currentRunLabel}
                <span className="text-slate-400">▾</span>
              </button>
              {postureDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" aria-hidden onClick={() => setPostureDropdownOpen(false)} />
                  <ul
                    className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
                    role="listbox"
                  >
                    {runsForDropdown.map((r) => (
                      <li key={r.run_id}>
                        <Link
                          href={`/run/chat?run_id=${r.run_id}`}
                          className={`block px-3 py-2 text-sm ${r.run_id === result.run_id ? "bg-sky-50 font-medium text-sky-800" : "text-slate-700 hover:bg-slate-50"}`}
                          onClick={() => setPostureDropdownOpen(false)}
                        >
                          {runLabel(r)}
                          {r.run_id === result.run_id && " (current)"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowRerunModal(true)}
              className="rounded-md border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
            >
              Run with different posture
            </button>
            {canSwitchProvider && (
              <RunWithDifferentAIButton
                result={result}
                onRerun={(newRunId) => router.push(`/run/chat?run_id=${newRunId}`)}
              />
            )}
            <Link
              href={`/run/result${result.run_id ? `?run_id=${result.run_id}` : ""}`}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
            >
              View single-page result
            </Link>
            <Link
              href="/intake"
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
            >
              New intake
            </Link>
          </div>
        </div>
      </header>

      {/* Modal: Run with different posture */}
      {showRerunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/50" aria-hidden onClick={() => !rerunSubmitting && setShowRerunModal(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Run with different posture</h2>
            <p className="mt-1 text-sm text-slate-600">
              Re-run the same analysis (same situation, constraints, and your clarification answers) with a different posture.
            </p>
            <div className="mt-4 space-y-4">
              {availablePostures.length === 0 ? (
                <p className="text-sm text-slate-600">You&apos;ve already run all postures for this decision. Use the dropdown above to switch between them.</p>
              ) : (
              <div>
                <label htmlFor="rerun-posture" className="block text-sm font-medium text-slate-700">
                  Posture
                </label>
                <select
                  id="rerun-posture"
                  value={availablePostures.includes(rerunPosture) ? rerunPosture : availablePostures[0]}
                  onChange={(e) => setRerunPosture(e.target.value as Posture)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {availablePostures.map((p) => (
                    <option key={p} value={p}>
                      {postureLabel(p)}
                    </option>
                  ))}
                </select>
              </div>
              )}
              {rerunPosture === "pressure_test" && availablePostures.length > 0 && (
                <div>
                  <label htmlFor="rerun-leaning" className="block text-sm font-medium text-slate-700">
                    Leaning toward
                  </label>
                  <input
                    id="rerun-leaning"
                    type="text"
                    value={rerunLeaningDirection}
                    onChange={(e) => setRerunLeaningDirection(e.target.value)}
                    placeholder="e.g. Option A"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              )}
              {rerunError && <p className="text-sm text-red-600">{rerunError}</p>}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !rerunSubmitting && setShowRerunModal(false)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRerunPosture}
                disabled={rerunSubmitting || availablePostures.length === 0 || (rerunPosture === "pressure_test" && !rerunLeaningDirection.trim())}
                className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {rerunSubmitting ? "Running…" : "Run analysis"}
              </button>
            </div>
          </div>
        </div>
      )}
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
                    sections={result.clarification_question_sections ?? []}
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
