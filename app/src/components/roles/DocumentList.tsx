import { ProcessingBadge } from "@/components/roles/ProcessingBadge";

export type RoleDocument = {
  id: string;
  filename: string;
  status: string;
  createdAt: string;
  sizeBytes: number;
};

type DocumentListProps = {
  documents: RoleDocument[];
  loading?: boolean;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentList({ documents, loading }: DocumentListProps) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading documents...</p>;
  }

  if (documents.length === 0) {
    return <p className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">No documents uploaded yet.</p>;
  }

  return (
    <div className="space-y-2">
      {documents.map((document) => (
        <article key={document.id} className="rounded-lg border bg-card p-3 shadow-2xs">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium">{document.filename}</p>
            <ProcessingBadge status={document.status} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatBytes(document.sizeBytes)} · {new Date(document.createdAt).toLocaleString()}
          </p>
        </article>
      ))}
    </div>
  );
}
