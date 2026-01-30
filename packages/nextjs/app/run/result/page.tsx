"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const RUN_RESULT_KEY = "decisionRunResult";

export default function RunResultPage() {
  const [json, setJson] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(RUN_RESULT_KEY);
    if (!raw) {
      setMissing(true);
      return;
    }
    try {
      const data = JSON.parse(raw);
      setJson(JSON.stringify(data, null, 2));
    } catch {
      setJson(raw);
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

  if (json === null) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <p className="text-slate-600">Loading…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Run result</h1>
          <Link href="/intake" className="text-sm text-sky-600 underline hover:text-sky-700">
            New intake
          </Link>
        </header>
        <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-800 shadow-sm">
          {json}
        </pre>
      </div>
    </main>
  );
}
