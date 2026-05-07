"use client";

import { useState } from "react";
import { Upload, FileJson, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ threadsCreated: number; messagesCreated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const getErrorMessage = (err: unknown) => err instanceof Error ? err.message : "Failed to import conversations";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const text = await file.text();
      let jsonData;
      try {
        jsonData = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON file. Please ensure you uploaded a valid ChatGPT export.");
      }

      const response = await fetch("/api/import/chatgpt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jsonData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to import conversations");
      }

      setResult({
        threadsCreated: data.threadsCreated,
        messagesCreated: data.messagesCreated,
      });
      setFile(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="mb-8">
        <Link 
          href="/settings/profile" 
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Profile
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Import Conversations</h1>
        <p className="text-muted-foreground mt-1">
          Import your chat history from other platforms like ChatGPT.
        </p>
      </div>

      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <FileJson className="h-5 w-5" />
            </div>
            <h2 className="text-lg font-semiboldText">ChatGPT Export</h2>
          </div>
          
          <p className="text-sm text-muted-foreground mb-6">
            Upload your <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">conversations.json</code> file from a ChatGPT data export.
            This will create new threads for each conversation in the export.
          </p>

          <div className="space-y-4">
            <div className={`relative border-2 border-dashed rounded-xl p-8 transition-colors text-center ${
              file ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}>
              <input
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={importing}
              />
              <div className="flex flex-col items-center gap-2">
                <Upload className={`h-8 w-8 ${file ? "text-primary" : "text-muted-foreground"}`} />
                {file ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Click or drag to upload conversations.json</p>
                    <p className="text-xs text-muted-foreground">JSON files only</p>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {result && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold mb-1">Import successful!</p>
                  <p>Created {result.threadsCreated} threads and {result.messagesCreated} messages.</p>
                  <button 
                    onClick={() => router.push("/")}
                    className="mt-3 text-xs font-medium underline underline-offset-4"
                  >
                    View your new threads
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!file || importing}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Importing Conversations...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Start Import
                </>
              )}
            </button>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-6 opacity-60 grayscale cursor-not-allowed">
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                Claude Export
                <span className="text-[10px] uppercase tracking-wider font-bold bg-muted px-1.5 py-0.5 rounded">Coming Soon</span>
            </h2>
            <p className="text-sm text-muted-foreground">
                Support for Anthropic Claude JSON exports is planned for a future update.
            </p>
        </section>
      </div>
    </div>
  );
}
