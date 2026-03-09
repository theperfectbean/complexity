import Link from "next/link";

import { auth } from "@/auth";

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <p>Please <Link className="underline" href="/login">sign in</Link> to view your library.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Library</h1>
      <p className="mt-2 text-sm text-zinc-500">Thread management UI can be expanded here.</p>
    </main>
  );
}
