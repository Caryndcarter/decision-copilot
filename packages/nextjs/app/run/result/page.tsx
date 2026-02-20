"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { DecisionRunResult } from "@/types/decision";
import { ResultContent } from "../result-content";
import { ClarificationForm } from "../clarification-form";

const RUN_RESULT_KEY = "decisionRunResult";

function RunResultContent() {
  const searchParams = useSearchParams();
  const [result, setResult] = useState<DecisionRunResult | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

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

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">Decision analysis</h1>
          <div className="flex items-center gap-4">
            <Link href={`/run/chat${result.run_id ? `?run_id=${result.run_id}` : ""}`} className="text-sm text-slate-500 underline hover:text-slate-700">
              Chat view
            </Link>
            <Link href="/intake" className="text-sm text-sky-600 underline hover:text-sky-700">
              New intake
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <ResultContent result={result} />

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
