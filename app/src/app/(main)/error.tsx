"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    toast.error(error.message || "Unexpected error");
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-6">
      <div className="w-full rounded-xl border p-6 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Try reloading this view. If this continues, check server logs.</p>
        <button type="button" className="mt-4 rounded-md border px-4 py-2 text-sm" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  );
}
