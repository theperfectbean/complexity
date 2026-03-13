import { FileText, File, Loader2 } from "lucide-react";
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

export function DocumentList({ documents, loading }: DocumentListProps) {
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
