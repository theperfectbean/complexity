import { auth } from "@/auth";
import { AppShell } from "@/components/layout/AppShell";

export default async function SpaceDetailPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const session = await auth();
  const { spaceId } = await params;

  if (!session?.user) {
    return <main className="mx-auto max-w-5xl p-6">Sign in to access this space.</main>;
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-semibold">Space {spaceId}</h1>
        <p className="mt-2 text-sm text-zinc-500">Upload docs and run space-scoped chat here.</p>
      </main>
    </AppShell>
  );
}
