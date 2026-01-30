import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold">Decision Copilot</h1>
      <p className="mt-4 text-gray-600">Welcome to Decision Copilot.</p>
      <p className="mt-6">
        <Link
          href="/intake"
          className="text-sky-600 underline hover:text-sky-700"
        >
          Start a decision intake →
        </Link>
      </p>
    </main>
  );
}
