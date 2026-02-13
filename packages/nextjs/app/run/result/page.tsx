"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const RUN_RESULT_KEY = "decisionRunResult";

interface BlindSpot {
  area: string;
  description: string;
}

interface Tradeoff {
  option: string;
  upside: string;
  downside: string;
}

interface StakeholderImpact {
  stakeholder: string;
  impact: string;
  sentiment: "positive" | "negative" | "neutral";
}

interface LensOutput {
  lens: string;
  confidence?: string;
  top_risks?: string[];
  irreversible_steps?: string[];
  safe_to_try_first?: string[];
  stakeholder_impacts?: StakeholderImpact[];
  execution_risks?: string[];
  assumptions_detected?: string[];
  blind_spots?: BlindSpot[];
  tradeoffs?: Tradeoff[];
  remaining_uncertainty?: string[];
  questions_to_answer_next?: Array<{
    question_id: string;
    lens: string;
    question_text: string;
    answer_type: string;
    options?: string[];
    required?: boolean;
  }>;
}

interface DecisionBrief {
  title: string;
  generated_at: string;
  summary: string;
  recommendation: string;
  key_considerations: string[];
  next_steps: string[];
}

interface RunResult {
  decision_id: string;
  run_id: string;
  status: string;
  intake: {
    situation: string;
    constraints: string;
    posture: string;
    leaning_direction?: string;
  };
  clarification_questions: LensOutput["questions_to_answer_next"];
  clarification_needed: boolean;
  lens_outputs: LensOutput[];
  decision_brief?: DecisionBrief;
}

function formatBriefDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
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

type ClarificationAnswers = Record<string, string | number | boolean>;

/** Unique key per question across lenses (risk and reversibility can both use e.g. "q1") */
function questionKey(q: { lens: string; question_id: string }) {
  return `${q.lens}-${q.question_id}`;
}

const POSTURE_LABELS: Record<string, string> = {
  explore: "Explore",
  pressure_test: "Pressure test",
  surface_risks: "Surface risks",
  generate_alternatives: "Generate alternatives",
};

const CLARIFICATION_SUBMITTING_STEPS = [
  "Updating risk analysis…",
  "Updating reversibility…",
  "Updating stakeholder impact…",
  "Preparing your recommendation…",
];

function postureLabel(posture: string): string {
  return POSTURE_LABELS[posture] ?? posture.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function RunResultContent() {
  const searchParams = useSearchParams();
  const [result, setResult] = useState<RunResult | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [clarificationAnswers, setClarificationAnswers] = useState<ClarificationAnswers>({});
  const [clarificationSubmitting, setClarificationSubmitting] = useState(false);
  const [clarificationSubmittingStep, setClarificationSubmittingStep] = useState(0);
  const [clarificationError, setClarificationError] = useState<string | null>(null);

  // Cycle through progress steps every 3s while clarification is submitting
  useEffect(() => {
    if (!clarificationSubmitting) return;
    const interval = setInterval(() => {
      setClarificationSubmittingStep((prev) => (prev + 1) % CLARIFICATION_SUBMITTING_STEPS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [clarificationSubmitting]);

  // Load run: from ?run_id=xxx (DB) or from sessionStorage
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
          setResult(data as RunResult);
          setRawJson(JSON.stringify(data, null, 2));
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
      const data = JSON.parse(raw) as RunResult;
      setResult(data);
      setRawJson(JSON.stringify(data, null, 2));
    } catch {
      setMissing(true);
    }
  }, [searchParams]);

  if (missing) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <h1 className="text-2xl font-semibold text-slate-900">Run result</h1>
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

  const riskLens = result.lens_outputs?.find((o) => o.lens === "risk");
  const reversibilityLens = result.lens_outputs?.find((o) => o.lens === "reversibility");
  const peopleLens = result.lens_outputs?.find((o) => o.lens === "people");
  const statusLabel =
    result.status === "awaiting_clarification"
      ? "Awaiting clarification"
      : result.status === "complete"
        ? "Complete"
        : result.status === "pending_brief"
          ? "Lenses complete (brief pending)"
          : result.status;

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Decision analysis</h1>
          <Link href="/intake" className="text-sm text-sky-600 underline hover:text-sky-700">
            New intake
          </Link>
        </header>

        {/* Context */}
        <Card className="mb-6">
          <Section title="Context">
            <p className="text-slate-800">
              <span className="font-medium">Situation:</span> {result.intake.situation}
            </p>
            <p className="mt-2 text-slate-800">
              <span className="font-medium">Constraints:</span> {result.intake.constraints}
            </p>
            <p className="mt-2 text-slate-600">
              <span className="font-medium">Posture:</span> {postureLabel(result.intake.posture)}
              {result.intake.leaning_direction && ` · Leaning toward: ${result.intake.leaning_direction}`}
            </p>
          </Section>
          <div className="mt-3">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                result.status === "complete"
                  ? "bg-emerald-100 text-emerald-800"
                  : result.status === "awaiting_clarification"
                    ? "bg-amber-100 text-amber-800"
                    : result.status === "pending_brief"
                      ? "bg-sky-100 text-sky-800"
                      : "bg-slate-100 text-slate-700"
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </Card>

        {/* Risk lens */}
        {riskLens && (
          <div className="space-y-6">
            {riskLens.top_risks && riskLens.top_risks.length > 0 && (
              <Card>
                <Section title="Top risks">
                  <ul className="list-inside list-disc space-y-1.5 text-slate-700">
                    {riskLens.top_risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </Section>
              </Card>
            )}

            {riskLens.assumptions_detected && riskLens.assumptions_detected.length > 0 && (
              <Card>
                <Section title="Assumptions detected">
                  <ul className="list-inside list-disc space-y-1.5 text-slate-700">
                    {riskLens.assumptions_detected.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </Section>
              </Card>
            )}

            {riskLens.blind_spots && riskLens.blind_spots.length > 0 && (
              <Card>
                <Section title="Blind spots">
                  <ul className="space-y-3">
                    {riskLens.blind_spots.map((b, i) => (
                      <li key={i} className="border-l-2 border-amber-300 pl-3">
                        <span className="font-medium text-slate-800">{b.area}:</span>{" "}
                        <span className="text-slate-700">{b.description}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              </Card>
            )}

            {riskLens.tradeoffs && riskLens.tradeoffs.length > 0 && (
              <Card>
                <Section title="Tradeoffs">
                  <div className="space-y-4">
                    {riskLens.tradeoffs.map((t, i) => (
                      <div key={i} className="rounded border border-slate-200 bg-slate-50/50 p-3">
                        <p className="font-medium text-slate-800">{t.option}</p>
                        <p className="mt-1 text-sm text-emerald-700">
                          <span className="font-medium">Upside:</span> {t.upside}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          <span className="font-medium">Downside:</span> {t.downside}
                        </p>
                      </div>
                    ))}
                  </div>
                </Section>
              </Card>
            )}

            {riskLens.remaining_uncertainty && riskLens.remaining_uncertainty.length > 0 && (
              <Card>
                <Section title="Remaining uncertainty">
                  <ul className="list-inside list-disc space-y-1.5 text-slate-700">
                    {riskLens.remaining_uncertainty.map((u, i) => (
                      <li key={i}>{u}</li>
                    ))}
                  </ul>
                </Section>
              </Card>
            )}

            {riskLens.questions_to_answer_next && riskLens.questions_to_answer_next.length > 0 && (
              <Card>
                <Section title="Questions to consider">
                  <ul className="space-y-2 text-slate-700">
                    {riskLens.questions_to_answer_next.map((q, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-slate-400">•</span>
                        <span>{q.question_text}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              </Card>
            )}
          </div>
        )}

        {/* Reversibility lens */}
        {reversibilityLens && (
          <div className="mt-6 space-y-6">
            {reversibilityLens.irreversible_steps && reversibilityLens.irreversible_steps.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <Section title="Irreversible steps">
                  <p className="mb-2 text-sm text-slate-600">
                    Steps or commitments that would be hard or impossible to undo.
                  </p>
                  <ul className="list-inside list-disc space-y-1.5 text-slate-700">
                    {reversibilityLens.irreversible_steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </Section>
              </div>
            )}

            {reversibilityLens.safe_to_try_first && reversibilityLens.safe_to_try_first.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <Section title="Safe to try first">
                  <p className="mb-2 text-sm text-slate-600">
                    Low-commitment steps or experiments you could try with minimal downside.
                  </p>
                  <ul className="list-inside list-disc space-y-1.5 text-slate-700">
                    {reversibilityLens.safe_to_try_first.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </Section>
              </div>
            )}
          </div>
        )}

        {/* People lens */}
        {peopleLens && (
          <div className="mt-6 space-y-6">
            {peopleLens.stakeholder_impacts && peopleLens.stakeholder_impacts.length > 0 && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 shadow-sm">
                <Section title="Stakeholder impacts">
                  <p className="mb-3 text-sm text-slate-600">
                    Who is affected by this decision and how.
                  </p>
                  <ul className="space-y-3">
                    {peopleLens.stakeholder_impacts.map((s, i) => (
                      <li key={i} className="flex flex-col gap-1">
                        <span className="font-medium text-slate-800">{s.stakeholder}</span>
                        <span
                          className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.sentiment === "positive"
                              ? "bg-emerald-100 text-emerald-800"
                              : s.sentiment === "negative"
                                ? "bg-red-100 text-red-800"
                                : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {s.sentiment}
                        </span>
                        <span className="text-slate-700">{s.impact}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              </div>
            )}
            {peopleLens.execution_risks && peopleLens.execution_risks.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <Section title="Execution risks">
                  <p className="mb-2 text-sm text-slate-600">
                    Risks to successful execution: adoption, resistance, capability gaps, coordination.
                  </p>
                  <ul className="list-inside list-disc space-y-1.5 text-slate-700">
                    {peopleLens.execution_risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </Section>
              </div>
            )}
          </div>
        )}

        {/* Clarification form */}
        {result.clarification_needed &&
          result.clarification_questions &&
          result.clarification_questions.length > 0 && (
            <Card className="mt-6 border-sky-200 bg-sky-50/50">
              <Section title="Follow-up questions">
                <p className="mb-4 text-sm text-slate-600">
                  Answer these to refine the analysis. Then we'll re-run and show an updated result.
                </p>
                <div className="mb-4 rounded-md border-2 border-dashed border-violet-300 bg-violet-50/50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-violet-200 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-700">
                      Demo
                    </span>
                    <span className="text-sm text-violet-700">Quick-fill for testing</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const samples: ClarificationAnswers = {};
                        result.clarification_questions?.forEach((q) => {
                          const key = questionKey(q);
                          if (q.answer_type === "boolean") {
                            samples[key] = true;
                          } else if (q.answer_type === "percentage") {
                            samples[key] = 50;
                          } else if (q.answer_type === "numeric") {
                            samples[key] = 5;
                          } else if (q.answer_type === "enum" && q.options?.length) {
                            samples[key] = q.options[0];
                          } else {
                            samples[key] = "Moderate impact expected. Need more data to assess fully.";
                          }
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
                        result.clarification_questions?.forEach((q) => {
                          const key = questionKey(q);
                          if (q.answer_type === "boolean") {
                            unknowns[key] = "unknown";
                          } else if (q.answer_type === "percentage" || q.answer_type === "numeric") {
                            unknowns[key] = 0;
                          } else if (q.answer_type === "enum" && q.options?.length) {
                            unknowns[key] = q.options[q.options.length - 1]; // often "Unknown" is last
                          } else {
                            unknowns[key] = "Unknown";
                          }
                        });
                        setClarificationAnswers(unknowns);
                      }}
                      className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100"
                    >
                      Mark all unknown
                    </button>
                  </div>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setClarificationError(null);
                    setClarificationSubmittingStep(0);
                    setClarificationSubmitting(true);
                    try {
                      const answers = result.clarification_questions!.map((q) => {
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
                          lens: q.lens as "risk" | "reversibility" | "people",
                          answer,
                          answer_type: q.answer_type as "enum" | "boolean" | "numeric" | "percentage" | "short_text",
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
                        setClarificationError(data.error || `Request failed (${res.status})`);
                        return;
                      }
                      const updated = data as RunResult;
                      if (typeof window !== "undefined") {
                        sessionStorage.setItem(RUN_RESULT_KEY, JSON.stringify(updated));
                      }
                      setResult(updated);
                      setRawJson(JSON.stringify(updated, null, 2));
                    } catch (err) {
                      setClarificationError(
                        err instanceof Error ? err.message : "Something went wrong"
                      );
                    } finally {
                      setClarificationSubmitting(false);
                    }
                  }}
                  className="space-y-4"
                >
                  {result.clarification_questions.map((q, i) => (
                    <div key={questionKey(q)}>
                      <label
                        htmlFor={questionKey(q)}
                        className="block text-sm font-medium text-slate-700"
                      >
                        {q.question_text}
                        {q.required && <span className="text-red-500"> *</span>}
                      </label>
                      {q.answer_type === "enum" && q.options && q.options.length > 0 ? (
                        <select
                          id={questionKey(q)}
                          required={q.required}
                          value={String(clarificationAnswers[questionKey(q)] ?? "")}
                          onChange={(e) =>
                            setClarificationAnswers((prev) => ({
                              ...prev,
                              [questionKey(q)]: e.target.value,
                            }))
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
                            setClarificationAnswers((prev) => ({
                              ...prev,
                              [questionKey(q)]: e.target.value,
                            }))
                          }
                          placeholder="Your answer"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                      )}
                    </div>
                  ))}
                  {clarificationError && (
                    <p className="text-sm text-red-600">{clarificationError}</p>
                  )}
                  {clarificationSubmitting && (
                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                      <p className="font-medium">{CLARIFICATION_SUBMITTING_STEPS[clarificationSubmittingStep]}</p>
                      <p className="mt-1 text-sky-600">This usually takes 5–15 seconds.</p>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={clarificationSubmitting}
                    className="flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-60"
                  >
                    {clarificationSubmitting ? (
                      <>
                        <span
                          className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                          aria-hidden
                        />
                        {CLARIFICATION_SUBMITTING_STEPS[clarificationSubmittingStep]}
                      </>
                    ) : (
                      "Submit answers & re-run analysis"
                    )}
                  </button>
                </form>
              </Section>
            </Card>
          )}

        {/* Decision brief */}
        {result.decision_brief && (
          <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-slate-900">
                {result.decision_brief.title || "Decision brief"}
              </h2>
              {result.decision_brief.generated_at && (
                <p className="text-xs text-slate-500">
                  Generated {formatBriefDate(result.decision_brief.generated_at)}
                </p>
              )}
            </div>
            <div className="mt-3">
              {result.decision_brief.summary === "Pending implementation" &&
              result.decision_brief.recommendation === "Pending implementation" &&
              !result.decision_brief.key_considerations?.length &&
              !result.decision_brief.next_steps?.length ? (
                <p className="text-slate-500 italic">
                  Brief synthesis not yet implemented. Your answers were used to re-run the lenses above; a summarized recommendation will appear here once synthesis is added.
                </p>
              ) : (
                <>
                  <p className="text-slate-800">{result.decision_brief.summary}</p>
                  <p className="mt-3 font-medium text-slate-800">{result.decision_brief.recommendation}</p>
                  {result.decision_brief.key_considerations?.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-slate-700">
                      {result.decision_brief.key_considerations.map((k, i) => (
                        <li key={i}>{k}</li>
                      ))}
                    </ul>
                  )}
                  {result.decision_brief.next_steps?.length > 0 && (
                    <ul className="mt-2 list-inside list-disc text-slate-700">
                      {result.decision_brief.next_steps.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Raw JSON toggle */}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="text-sm text-slate-500 underline hover:text-slate-700"
          >
            {showRaw ? "Hide raw JSON" : "View raw JSON"}
          </button>
          {showRaw && rawJson && (
            <pre className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600">
              {rawJson}
            </pre>
          )}
        </div>
      </div>
    </main>
  );
}

export default function RunResultPage() {
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
      <RunResultContent />
    </Suspense>
  );
}
