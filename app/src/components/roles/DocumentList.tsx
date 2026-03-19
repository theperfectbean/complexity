import { FileText, File, Loader2, X, Eye } from "lucide-react";
import { ProcessingBadge } from "@/components/roles/ProcessingBadge";
import { useState } from "react";
import { toast } from "sonner";
import DocumentChunksDialog from "./DocumentChunksDialog";

export type RoleDocument = {
  id: string;
  filename: string;
  status: string;
  createdAt: string;
  sizeBytes: number;
  roleId: string;
};

type DocumentListProps = {
  documents: RoleDocument[];
  loading?: boolean;
  onDeleted?: (documentId: string) => void;
};

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return <FileText className="h-8 w-8 text-rose-500/80" />;
    case "docx":
      return <FileText className="h-8 w-8 text-blue-500/80" />;
    case "txt":
    case "md":
      return <FileText className="h-8 w-8 text-muted-foreground/70" />;
    default:
      return <File className="h-8 w-8 text-muted-foreground/50" />;
  }
}

function getFileTypeLabel(filename: string) {
  return filename.split(".").pop()?.toUpperCase() || "FILE";
}

export function DocumentList({ documents, loading, onDeleted }: DocumentListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(documentId: string, roleId: string) {
    if (!confirm("Are you sure you want to delete this document?")) return;

    setDeletingId(documentId);
    try {
      const response = await fetch(`/api/roles/${roleId}/documents/${documentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        toast.error("Failed to delete document");
        return;
      }

      toast.success("Document deleted");
      onDeleted?.(documentId);
    } catch {
      toast.error("An error occurred while deleting");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading files...</span>
      </div>
    );
  }

  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {documents.map((document) => (
        <article
          key={document.id}
          className="group relative flex flex-col justify-between rounded-xl border border-border/50 bg-background p-3 transition-colors hover:bg-muted/30"
          title={document.filename}
        >
          <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <DocumentChunksDialog
              roleId={document.roleId}
              documentId={document.id}
              filename={document.filename}
              trigger={
                <button
                  type="button"
                  className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label={`View chunks for ${document.filename}`}
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
              }
            />
            <button
              type="button"
              onClick={() => void handleDelete(document.id, document.roleId)}
              disabled={deletingId === document.id}
              className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              aria-label={`Delete ${document.filename}`}
            >
              {deletingId === document.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          <div className="flex flex-1 flex-col items-start gap-2">
             <div className="mb-1">{getFileIcon(document.filename)}</div>
             <p className="line-clamp-2 w-full text-[13px] font-medium leading-tight text-foreground/90">
               {document.filename}
             </p>
          </div>
          
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-muted-foreground/80">
              {getFileTypeLabel(document.filename)}
            </span>
            {document.status !== "ready" && (
              <ProcessingBadge status={document.status} />
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

