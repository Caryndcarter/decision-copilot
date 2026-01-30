"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const RUN_RESULT_KEY = "decisionRunResult";

const POSTURES = [
  { value: "explore", label: "Explore" },
  { value: "pressure_test", label: "Pressure test" },
  { value: "surface_risks", label: "Surface risks" },
  { value: "generate_alternatives", label: "Generate alternatives" },
] as const;

export default function IntakePage() {
  const [situation, setSituation] = useState("");
  const [constraints, setConstraints] = useState("");
  const [posture, setPosture] = useState<(typeof POSTURES)[number]["value"]>("explore");
  const [leaningDirection, setLeaningDirection] = useState("");
  const [knownsAssumptions, setKnownsAssumptions] = useState("");
  const [unknowns, setUnknowns] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const showLeaningDirection = posture === "pressure_test";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
            Describe your decision and how you’d like to explore it.
          </p>
        </header>

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

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-sky-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
