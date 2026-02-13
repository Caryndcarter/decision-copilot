"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

interface LensOutput {
  lens: string;
  confidence?: string;
  top_risks?: string[];
  irreversible_steps?: string[];
  safe_to_try_first?: string[];
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

export default function RunResultPage() {
  const [result, setResult] = useState<RunResult | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
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
  }, []);

  if (missing) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <h1 className="text-2xl font-semibold text-slate-900">Run result</h1>
          <p className="mt-4 text-slate-600">No run result in this session. Start from the intake form.</p>
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
  const statusLabel =
    result.status === "awaiting_clarification"
      ? "Awaiting clarification"
      : result.status === "complete"
        ? "Complete"
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
              <span className="font-medium">Posture:</span> {result.intake.posture}
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

        {/* Decision brief */}
        {result.decision_brief && (
          <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <Section title="Decision brief">
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
            </Section>
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
