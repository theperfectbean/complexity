"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    // TODO: Implement actual forgot password logic
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);

    if (response.ok) {
      setMessage("If an account exists for that email, we have sent password reset instructions.");
    } else {
      const payload = await response.json().catch(() => null);
      setError(payload?.error ?? "Something went wrong. Please try again later.");
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <div className="w-full space-y-4 rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email address and we'll send you a link to reset your password.
        </p>
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            className="w-full rounded-md border bg-transparent px-3 py-2"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          {message ? <p className="text-sm text-green-500">{message}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
        <p className="text-sm text-muted-foreground text-center">
          <Link href="/login" className="underline hover:text-foreground">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
