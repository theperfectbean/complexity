import Link from "next/link";

type SpaceCardProps = {
  id: string;
  name: string;
  description?: string | null;
  updatedAt: string;
  onRename?: () => void;
  onDelete?: () => void;
  busy?: boolean;
};

export function SpaceCard({ id, name, description, updatedAt, onRename, onDelete, busy }: SpaceCardProps) {
  return (
    <article className="rounded-lg border bg-card p-4 shadow-2xs">
      <Link href={`/spaces/${id}`} className="block rounded-md p-1 transition-colors hover:bg-accent/50">
        <p className="font-medium tracking-tight">{name}</p>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description || "No description"}</p>
        <p className="mt-2 text-xs text-muted-foreground">Updated {new Date(updatedAt).toLocaleString()}</p>
      </Link>
      {(onRename || onDelete) && (
        <div className="mt-3 flex items-center gap-2">
          {onRename ? (
            <button
              type="button"
              className="rounded-md border bg-card px-2 py-1 text-xs hover:bg-accent"
              onClick={onRename}
              disabled={busy}
            >
              Rename
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
              onClick={onDelete}
              disabled={busy}
            >
              Delete
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}
