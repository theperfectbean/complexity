import { Pin } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type RoleCardProps = {
  id: string;
  name: string;
  description?: string | null;
  updatedAt: string;
  pinned?: boolean;
  onRename?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  busy?: boolean;
};

export function RoleCard({ 
  id, 
  name, 
  description, 
  updatedAt, 
  pinned = false, 
  onRename, 
  onDelete, 
  onPin,
  busy 
}: RoleCardProps) {
  return (
    <article className="group relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl border border-border/60 bg-background p-5 transition-colors hover:bg-muted/30">
      <Link href={`/roles/${id}`} className="absolute inset-0 z-10" aria-label={`View role ${name}`} />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-medium text-foreground">{name}</h3>
          {description && (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        {onPin && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPin();
            }}
            disabled={busy}
            className={cn(
              "relative z-20 inline-flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200",
              pinned 
                ? "bg-primary/10 text-primary opacity-100" 
                : "text-muted-foreground/40 hover:bg-muted/60 hover:text-foreground opacity-0 group-hover:opacity-100"
            )}
            title={pinned ? "Unpin from sidebar" : "Pin to sidebar"}
          >
            <Pin className={cn("h-3.5 w-3.5", pinned && "fill-current")} />
          </button>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between">
...
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
