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
    <article className="rounded-xl border p-4">
      <Link href={`/spaces/${id}`} className="block hover:bg-muted/40">
        <p className="font-medium">{name}</p>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description || "No description"}</p>
        <p className="mt-2 text-xs text-muted-foreground">Updated {new Date(updatedAt).toLocaleString()}</p>
      </Link>
      {(onRename || onDelete) && (
        <div className="mt-3 flex items-center gap-2">
          {onRename ? (
            <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={onRename} disabled={busy}>
              Rename
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={onDelete} disabled={busy}>
              Delete
            </button>
          ) : null}
        </div>
      )}
    </article>
  );
}
