import Link from "next/link";

import { auth } from "@/auth";

export default async function SpacesPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p>Please <Link className="underline" href="/login">sign in</Link> to manage spaces.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Spaces</h1>
      <p className="mt-2 text-sm text-zinc-500">Create and manage your RAG spaces from this page.</p>
    </main>
  );
}
