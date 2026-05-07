"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, email, password }),
    });

    setLoading(false);

    if (response.ok) {
      router.push("/login?reset=success");
    } else {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? "Failed to reset password. The link may have expired.");
    }
  }

  if (!token || !email) {
    return (
      <div className="w-full space-y-4 rounded-2xl border p-6 text-center">
        <h1 className="text-2xl font-semibold text-red-500">Invalid Link</h1>
        <p className="text-sm text-muted-foreground">
          This password reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password" title="Try again" className="inline-block rounded-md bg-foreground px-4 py-2 text-background hover:opacity-90">
          Try again
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 rounded-2xl border p-6">
      <h1 className="text-2xl font-semibold">New password</h1>
      <p className="text-sm text-muted-foreground">
        Set a new password for your account.
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <input
          className="w-full rounded-md border bg-transparent px-3 py-2"
          type="password"
          placeholder="New Password (min 8 chars)"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <input
          className="w-full rounded-md border bg-transparent px-3 py-2"
          type="password"
          placeholder="Confirm New Password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-60"
        >
          {loading ? "Resetting..." : "Reset password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <Suspense fallback={<div>Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
