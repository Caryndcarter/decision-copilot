"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const RUN_RESULT_KEY = "decisionRunResult";

const SUBMITTING_STEPS = [
  "Analyzing risks…",
  "Checking reversibility…",
  "Considering stakeholders…",
  "Preparing your brief…",
];

const POSTURES = [
  { value: "explore", label: "Explore" },
  { value: "pressure_test", label: "Pressure test" },
  { value: "surface_risks", label: "Surface risks" },
  { value: "generate_alternatives", label: "Generate alternatives" },
] as const;

const DEMO_SCENARIOS = [
  {
    id: "slack-to-teams",
    label: "Slack → Teams migration",
    situation:
      "We're considering replacing Slack with Microsoft Teams to consolidate our tooling. We already pay for Microsoft 365 and Teams is included. Slack costs us $15k/year. The engineering team strongly prefers Slack; everyone else is indifferent.",
    constraints:
      "IT wants to decide by end of quarter. 85 employees. No budget for running both tools long-term.",
    posture: "explore" as const,
    leaning_direction: "",
    knowns_assumptions:
      "Teams has feature parity for most use cases. Engineers use Slack integrations heavily (GitHub, PagerDuty, CI alerts). Migration would take 2-3 weeks. I assume people will adapt after initial grumbling.",
    unknowns:
      "How much productivity we'd lose during transition. Whether the Slack integrations have Teams equivalents. If engineers would see this as a signal that leadership doesn't value their preferences.",
  },
  {
    id: "vp-sales-underperforming",
    label: "Underperforming VP Sales",
    situation:
      "Our VP of Sales of 2 years is underperforming. Pipeline is down 30% year-over-year despite adding two reps. She's well-liked, has deep customer relationships, and was critical to landing our three largest accounts. The board is asking why we're missing targets.",
    constraints:
      "Q4 planning starts in 6 weeks. Sales team is already anxious about potential changes. We can't afford a long leadership gap.",
    posture: "pressure_test" as const,
    leaning_direction:
      "Keeping her but adding a sales ops lead to handle process and accountability, letting her focus on strategic deals",
    knowns_assumptions:
      "She's great at relationships but weak on process and pipeline management. The two new reps aren't ramping well due to lack of structure. I assume adding ops support will fix the gap without losing her customer relationships.",
    unknowns:
      "Whether she'll accept an ops hire as support vs. see it as undermining her. If the real problem is her or the reps she hired. How the board will react to anything short of replacement.",
  },
  {
    id: "vercel-to-aws",
    label: "Vercel → AWS migration",
    situation:
      "We're evaluating whether to migrate our Next.js app from Vercel to self-hosted on AWS (ECS + CloudFront). Vercel costs are growing fast — we're at $1,800/month and projected to hit $5k/month in 6 months as traffic scales. Self-hosted would cost roughly $600/month at current traffic but requires setup and maintenance.",
    constraints:
      "Two engineers can dedicate 2 weeks to migration. Need zero-downtime cutover. Currently using Vercel's edge functions, image optimization, and analytics. Page load times must stay under 200ms.",
    posture: "surface_risks" as const,
    leaning_direction: "",
    knowns_assumptions:
      "Our app doesn't use Vercel-specific features that can't be replicated (ISR works with standard Next.js, edge functions can move to Lambda@Edge). We have AWS experience from other projects. I assume CloudFront + ECS can match Vercel's performance. Our CI/CD is already GitHub Actions so deployment changes are manageable.",
    unknowns:
      "Hidden complexity in replicating Vercel's build pipeline. Whether Lambda@Edge cold starts will hurt performance. True ongoing maintenance burden for ECS (patching, scaling configs, debugging). If the cost projections account for CloudFront bandwidth costs accurately.",
  },
] as const;

export default function IntakePage() {
  const [situation, setSituation] = useState("");
  const [constraints, setConstraints] = useState("");
  const [posture, setPosture] = useState<(typeof POSTURES)[number]["value"]>("explore");
  const [leaningDirection, setLeaningDirection] = useState("");
  const [knownsAssumptions, setKnownsAssumptions] = useState("");
  const [unknowns, setUnknowns] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittingStep, setSubmittingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const showLeaningDirection = posture === "pressure_test";

  function loadDemo(demoId: string) {
    const demo = DEMO_SCENARIOS.find((d) => d.id === demoId);
    if (!demo) return;
    setSituation(demo.situation);
    setConstraints(demo.constraints);
    setPosture(demo.posture);
    setLeaningDirection(demo.leaning_direction);
    setKnownsAssumptions(demo.knowns_assumptions);
    setUnknowns(demo.unknowns);
  }

  // Cycle through progress steps every 3s while submitting (gives sense of progress during 5–15s API call)
  useEffect(() => {
    if (!submitting) return;
    const interval = setInterval(() => {
      setSubmittingStep((prev) => (prev + 1) % SUBMITTING_STEPS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [submitting]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmittingStep(0);
    setSubmitting(true);

    const intake = {
      situation: situation.trim(),
      constraints: constraints.trim(),
      posture,
      ...(showLeaningDirection && leaningDirection.trim() ? { leaning_direction: leaningDirection.trim() } : {}),
      ...(knownsAssumptions.trim() ? { knowns_assumptions: knownsAssumptions.trim() } : {}),
      ...(unknowns.trim() ? { unknowns: unknowns.trim() } : {}),
    };

    try {
      const res = await fetch("/api/decision/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "intake", intake }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        return;
      }

      if (typeof window !== "undefined") {
        sessionStorage.setItem(RUN_RESULT_KEY, JSON.stringify(data));
      }
      router.push("/run/result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-2xl font-semibold text-slate-900">Decision intake</h1>
          <p className="mt-1 text-slate-600">
            Describe your decision and how you'd like to explore it.
          </p>
        </header>

        {/* Demo scenarios */}
        <div className="mb-8 rounded-lg border-2 border-dashed border-violet-300 bg-violet-50/50 p-4">
          <div className="flex items-center gap-2">
            <span className="rounded bg-violet-200 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-700">
              Demo
            </span>
            <p className="text-sm text-violet-700">Load a sample scenario to try it out</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO_SCENARIOS.map((demo) => (
              <button
                key={demo.id}
                type="button"
                onClick={() => loadDemo(demo.id)}
                className="rounded-md border border-violet-300 bg-white px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100 hover:border-violet-400"
              >
                {demo.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div>
            <label htmlFor="situation" className="block text-sm font-medium text-slate-700">
              Situation <span className="text-red-500">*</span>
            </label>
            <textarea
              id="situation"
              required
              rows={4}
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              placeholder="e.g. Switching from MongoDB to PostgreSQL"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label htmlFor="constraints" className="block text-sm font-medium text-slate-700">
              Constraints <span className="text-red-500">*</span>
            </label>
            <textarea
              id="constraints"
              required
              rows={2}
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="e.g. 3 months, 2 developers"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label htmlFor="posture" className="block text-sm font-medium text-slate-700">
              Posture <span className="text-red-500">*</span>
            </label>
            <select
              id="posture"
              required
              value={posture}
              onChange={(e) => setPosture(e.target.value as (typeof POSTURES)[number]["value"])}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {POSTURES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {showLeaningDirection && (
            <div>
              <label htmlFor="leaning_direction" className="block text-sm font-medium text-slate-700">
                Leaning toward <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="leaning_direction"
                value={leaningDirection}
                onChange={(e) => setLeaningDirection(e.target.value)}
                placeholder="e.g. Migrating to PostgreSQL"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          )}

          <div>
            <label htmlFor="knowns_assumptions" className="block text-sm font-medium text-slate-700">
              What I know / am assuming
            </label>
            <textarea
              id="knowns_assumptions"
              rows={2}
              value={knownsAssumptions}
              onChange={(e) => setKnownsAssumptions(e.target.value)}
              placeholder="Optional"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          <div>
            <label htmlFor="unknowns" className="block text-sm font-medium text-slate-700">
              What I don’t know
            </label>
            <textarea
              id="unknowns"
              rows={2}
              value={unknowns}
              onChange={(e) => setUnknowns(e.target.value)}
              placeholder="Optional"
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {submitting && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              <p className="font-medium">{SUBMITTING_STEPS[submittingStep]}</p>
              <p className="mt-1 text-sky-600">This usually takes 5–15 seconds.</p>
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    aria-hidden
                  />
                  {SUBMITTING_STEPS[submittingStep]}
                </>
              ) : (
                "Submit"
              )}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
