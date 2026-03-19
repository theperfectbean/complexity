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
  const [totpCode, setTotpCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      totpCode: totpCode || undefined,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      if (result.error.includes("EMAIL_NOT_VERIFIED")) {
        setError("Please verify your email address before signing in. Check your inbox for a verification link.");
      } else if (result.error.includes("TOTP_REQUIRED")) {
        setNeedsTotp(true);
        setError(null);
      } else if (result.error.includes("TOTP_INVALID")) {
        setError("Invalid 2FA code. Please try again.");
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
        {!needsTotp ? (
          <>
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
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
            <input
              className="w-full rounded-md border bg-transparent px-3 py-2 text-center text-lg tracking-widest"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              value={totpCode}
              onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ""))}
              autoFocus
              required
            />
            <button type="button" onClick={() => { setNeedsTotp(false); setTotpCode(""); }} className="text-xs text-muted-foreground underline">
              Back to login
            </button>
          </div>
        )}
        <div className="flex items-center justify-between px-1">
          {error ? <p className="text-sm text-red-500">{error}</p> : <div />}
          {!needsTotp && (
            <Link href="/forgot-password" title="Forgot password?" className="text-xs text-muted-foreground underline hover:text-foreground">
              Forgot password?
            </Link>
          )}
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-60"
        >
          {loading ? "Signing in..." : needsTotp ? "Verify" : "Sign in"}
        </button>
        {!needsTotp && (
          <>
            <div className="relative my-2 flex items-center">
              <div className="flex-1 border-t" />
              <span className="mx-3 text-xs text-muted-foreground">or continue with</span>
              <div className="flex-1 border-t" />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => signIn("github", { callbackUrl: "/" })}
                className="flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
                GitHub
              </button>
              <button
                type="button"
                onClick={() => signIn("google", { callbackUrl: "/" })}
                className="flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google
              </button>
            </div>
          </>
        )}
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
