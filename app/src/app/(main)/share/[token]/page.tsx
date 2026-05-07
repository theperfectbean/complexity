import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { threads, messages as messagesTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";

export const dynamic = "force-dynamic";

type SharePageProps = { params: Promise<{ token: string }> };

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;

  const [thread] = await db
    .select()
    .from(threads)
    .where(eq(threads.shareToken, token))
    .limit(1);

  if (!thread) notFound();

  const msgs = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.threadId, thread.id))
    .orderBy(messagesTable.createdAt);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 border-b border-border/40 pb-6">
        <div className="mb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Shared conversation
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{thread.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(thread.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="space-y-6">
        {msgs.map((msg) => (
          <div
            key={msg.id}
            className={
              msg.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl bg-primary/10 px-5 py-3"
                : "max-w-full"
            }
          >
            {msg.role === "user" ? (
              <p className="text-sm">{msg.content}</p>
            ) : (
              <MarkdownRenderer content={msg.content} />
            )}
          </div>
        ))}
      </div>

      <footer className="mt-16 border-t border-border/40 pt-6 text-center text-xs text-muted-foreground">
        Shared via{" "}
        <span className="font-semibold text-foreground">Complexity</span>
      </footer>
    </main>
  );
}
