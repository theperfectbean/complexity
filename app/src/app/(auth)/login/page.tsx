"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isResetSuccess = searchParams.get("reset") === "success";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      if (result.error.includes("EMAIL_NOT_VERIFIED")) {
        setError("Please verify your email address before signing in. Check your inbox for a verification link.");
      } else {
        setError("Invalid email or password");
      }
      return;
    }

    router.push("/");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-6">
      <form onSubmit={onSubmit} className="w-full space-y-4 rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        {isResetSuccess && (
          <p className="rounded-md bg-green-500/10 p-2 text-sm text-green-500">
            Password reset successful! You can now sign in with your new password.
          </p>
        )}
        <input
          className="w-full rounded-md border bg-transparent px-3 py-2"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          className="w-full rounded-md border bg-transparent px-3 py-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <div className="flex items-center justify-between px-1">
          {error ? <p className="text-sm text-red-500">{error}</p> : <div />}
          <Link href="/forgot-password" title="Forgot password?" className="text-xs text-muted-foreground underline hover:text-foreground">
            Forgot password?
          </Link>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="text-sm text-muted-foreground">
          No account? <Link href="/register" className="underline">Create one</Link>
        </p>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
