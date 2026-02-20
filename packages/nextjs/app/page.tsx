import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <h1 className="text-xl font-semibold text-slate-900">Decision Copilot</h1>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="mt-4 text-slate-600">Welcome to Decision Copilot.</p>
        <p className="mt-6">
          <Link
            href="/intake"
            className="text-sky-600 underline hover:text-sky-700"
          >
            Start a decision intake →
          </Link>
        </p>
      </div>
    </main>
  );
}
