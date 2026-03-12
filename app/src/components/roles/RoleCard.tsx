import Link from "next/link";

type RoleCardProps = {
  id: string;
  name: string;
  description?: string | null;
  updatedAt: string;
  onRename?: () => void;
  onDelete?: () => void;
  busy?: boolean;
};

export function RoleCard({ id, name, description, updatedAt, onRename, onDelete, busy }: RoleCardProps) {
  return (
    <article className="group relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl border border-border/60 bg-background p-5 transition-colors hover:bg-muted/30">
      <Link href={`/roles/${id}`} className="absolute inset-0 z-10" aria-label={`View role ${name}`} />
      <div>
        <h3 className="font-medium text-foreground">{name}</h3>
        {description && (
          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <p className="text-[13px] text-muted-foreground">
          Updated {new Date(updatedAt).toLocaleDateString()}
        </p>
        {(onRename || onDelete) && (
          <div className="z-20 flex opacity-0 transition-opacity group-hover:opacity-100">
            {onRename ? (
              <button
                type="button"
                className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                onClick={onRename}
                disabled={busy}
              >
                Rename
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                className="px-2 py-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
                onClick={onDelete}
                disabled={busy}
              >
                Delete
              </button>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}
