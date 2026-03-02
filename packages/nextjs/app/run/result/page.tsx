"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { DecisionRunResult, Posture } from "@/types/decision";
import { ResultContent } from "../result-content";
import { ClarificationForm } from "../clarification-form";

const RUN_RESULT_KEY = "decisionRunResult";

const POSTURE_LABELS: Record<string, string> = {
  explore: "Explore",
  pressure_test: "Pressure test",
  surface_risks: "Surface risks",
  generate_alternatives: "Generate alternatives",
};

function postureLabel(posture: string): string {
  return POSTURE_LABELS[posture] ?? posture.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const POSTURES: Posture[] = ["explore", "pressure_test", "surface_risks", "generate_alternatives"];

function RunResultContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [result, setResult] = useState<DecisionRunResult | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [otherRuns, setOtherRuns] = useState<DecisionRunResult[]>([]);
  const [postureDropdownOpen, setPostureDropdownOpen] = useState(false);
  const [showRerunModal, setShowRerunModal] = useState(false);
  const [rerunPosture, setRerunPosture] = useState<Posture>("explore");
  const [rerunLeaningDirection, setRerunLeaningDirection] = useState("");
  const [rerunSubmitting, setRerunSubmitting] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

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
      const data = JSON.parse(raw) as DecisionRunResult;
      setResult(data);
      setRawJson(JSON.stringify(data, null, 2));
    } catch {
      setMissing(true);
    }
  }, [searchParams]);

  // Refetch when run_id changes so dropdown stays in sync (e.g. after navigating from chat)
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

  useEffect(() => {
    if (showRerunModal && result) {
      const posturesRun = new Set((otherRuns.length > 0 ? otherRuns : [result]).map((r) => r.intake.posture));
      const available = POSTURES.filter((p) => !posturesRun.has(p));
      if (available[0]) setRerunPosture(available[0]);
      setRerunLeaningDirection("");
      setRerunError(null);
    }
  }, [showRerunModal, result?.intake.posture, otherRuns]);

  const handleUpdatedResult = (updated: DecisionRunResult) => {
    setResult(updated);
    setRawJson(JSON.stringify(updated, null, 2));
    if (typeof window !== "undefined") {
      sessionStorage.setItem(RUN_RESULT_KEY, JSON.stringify(updated));
    }
  };

  if (missing) {
    return (
      <main className="min-h-screen bg-slate-50">
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
          <div className="mx-auto max-w-3xl px-6 py-4">
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
          <div className="mx-auto max-w-3xl px-6 py-4">
            <h1 className="text-xl font-semibold text-slate-900">Decision analysis</h1>
          </div>
        </header>
        <div className="mx-auto max-w-2xl px-6 py-12">
          <p className="text-slate-600">Loading…</p>
        </div>
      </main>
    );
  }

  const runsList = otherRuns.length > 0 ? otherRuns : [result];
  const hasCurrent = result && runsList.some((r) => r.run_id === result.run_id);
  const runsForDropdown = hasCurrent ? runsList : result ? [result, ...runsList] : runsList;
  const currentPostureLabel = postureLabel(result.intake.posture);
  const posturesAlreadyRun = new Set(runsForDropdown.map((r) => r.intake.posture));
  const availablePostures = POSTURES.filter((p) => !posturesAlreadyRun.has(p));

  async function handleRerunPosture() {
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
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-semibold text-slate-900">Decision analysis</h1>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <button
                type="button"
                onClick={() => setPostureDropdownOpen((o) => !o)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1"
                aria-expanded={postureDropdownOpen}
                aria-haspopup="listbox"
              >
                Posture: {currentPostureLabel}
                <span className="text-slate-400">▾</span>
              </button>
              {postureDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" aria-hidden onClick={() => setPostureDropdownOpen(false)} />
                  <ul className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-md border border-slate-200 bg-white py-1 shadow-lg" role="listbox">
                    {runsForDropdown.map((r) => (
                      <li key={r.run_id}>
                        <Link
                          href={`/run/result?run_id=${r.run_id}`}
                          className={`block px-3 py-2 text-sm ${r.run_id === result.run_id ? "bg-sky-50 font-medium text-sky-800" : "text-slate-700 hover:bg-slate-50"}`}
                          onClick={() => setPostureDropdownOpen(false)}
                        >
                          {postureLabel(r.intake.posture)}
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
            <Link href={`/run/chat${result.run_id ? `?run_id=${result.run_id}` : ""}`} className="text-sm text-slate-500 underline hover:text-slate-700">
              Chat view
            </Link>
            <Link href="/intake" className="text-sm text-sky-600 underline hover:text-sky-700">
              New intake
            </Link>
          </div>
        </div>
      </header>

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
                <label htmlFor="rerun-posture-result" className="block text-sm font-medium text-slate-700">Posture</label>
                <select
                  id="rerun-posture-result"
                  value={availablePostures.includes(rerunPosture) ? rerunPosture : availablePostures[0]}
                  onChange={(e) => setRerunPosture(e.target.value as Posture)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {availablePostures.map((p) => (
                    <option key={p} value={p}>{postureLabel(p)}</option>
                  ))}
                </select>
              </div>
              )}
              {rerunPosture === "pressure_test" && availablePostures.length > 0 && (
                <div>
                  <label htmlFor="rerun-leaning-result" className="block text-sm font-medium text-slate-700">Leaning toward</label>
                  <input
                    id="rerun-leaning-result"
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
              <button type="button" onClick={() => !rerunSubmitting && setShowRerunModal(false)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
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

      <div className="mx-auto max-w-3xl px-6 py-8">
        <ResultContent
          result={result}
          onRunUpdate={(updated) => {
            setResult(updated);
            setRawJson(JSON.stringify(updated, null, 2));
            if (typeof window !== "undefined") {
              sessionStorage.setItem(RUN_RESULT_KEY, JSON.stringify(updated));
            }
          }}
        />

        {result.clarification_needed &&
          result.clarification_questions &&
          result.clarification_questions.length > 0 && (
            <ClarificationForm result={result} onUpdatedResult={handleUpdatedResult} />
          )}

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
