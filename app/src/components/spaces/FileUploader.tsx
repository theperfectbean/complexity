"use client";

import { FormEvent, useState } from "react";

type FileUploaderProps = {
  spaceId: string;
  onUploaded: () => void;
};

export function FileUploader({ spaceId, onUploaded }: FileUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || uploading) {
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch(`/api/spaces/${spaceId}/upload`, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Upload failed");
        return;
      }

      setFile(null);
      onUploaded();
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border p-4">
      <h3 className="text-sm font-semibold">Upload document</h3>
      <input
        type="file"
        accept=".pdf,.docx,.txt,.md"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      <button type="submit" disabled={!file || uploading} className="rounded-md border px-3 py-2 text-sm">
        {uploading ? "Uploading..." : "Upload"}
      </button>
    </form>
  );
}
