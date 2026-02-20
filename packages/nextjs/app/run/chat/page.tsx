"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { DecisionRunResult } from "@/types/decision";
import { ResultContent } from "../result-content";
import { ClarificationForm } from "../clarification-form";

const RUN_RESULT_KEY = "decisionRunResult";

export function ChatContent() {
  const searchParams = useSearchParams();
  const [result, setResult] = useState<DecisionRunResult | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  const handleUpdatedResult = (updated: DecisionRunResult) => {
    setResult(updated);
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

  const showQuestions =
    result.clarification_needed &&
    result.clarification_questions &&
    result.clarification_questions.length > 0;

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
            showQuestions
              ? "grid grid-cols-1 gap-8 lg:grid-cols-[1fr_380px]"
              : "max-w-3xl"
          }
        >
          {/* Left: result content (refreshes when clarification is submitted) */}
          <div className="min-w-0">
            <ResultContent result={result} />
          </div>

          {/* Right: clarification questions only when in that stage */}
          {showQuestions && (
            <aside className="min-w-0 lg:max-w-[380px]">
              <ClarificationForm
                result={result}
                onUpdatedResult={handleUpdatedResult}
                variant="sidebar"
              />
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
