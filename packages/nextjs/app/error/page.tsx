"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const errorMessage =
    errorDescription || error || "An unexpected error occurred.";

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="mb-4 text-2xl font-bold">Error</h1>
        <p className="mb-6 text-gray-600">{errorMessage}</p>
        <a
          href="/"
          className="inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Return to Home
        </a>
      </div>
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ErrorContent />
    </Suspense>
  );
}
