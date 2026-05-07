"use client";

import { useState, useEffect, useRef } from "react";
import { Play, RotateCcw, Loader2, Terminal, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PythonExecutorProps {
  code: string;
}

interface PyodideInterface {
  runPythonAsync: (code: string) => Promise<void>;
  setStdout: (options: { batched: (text: string) => void }) => void;
}

declare global {
  interface Window {
    loadPyodide: (config: { indexURL: string }) => Promise<PyodideInterface>;
  }
}

export default function PythonExecutor({ code }: PythonExecutorProps) {
  const [output, setOutput] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPyodideLoaded, setIsPyodideLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const pyodideRef = useRef<PyodideInterface | null>(null);

  useEffect(() => {
    // Only load script once if it's not already there
    if (!document.getElementById("pyodide-script")) {
      const script = document.createElement("script");
      script.id = "pyodide-script";
      script.src = "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const initPyodide = async () => {
    if (pyodideRef.current) return pyodideRef.current;
    
    setIsLoading(true);
    try {
      // Wait for script to be available in window
      let attempts = 0;
      while (!window.loadPyodide && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!window.loadPyodide) {
        throw new Error("Pyodide script failed to load");
      }

      const pyodide = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/",
      });
      
      pyodideRef.current = pyodide;
      setIsPyodideLoaded(true);
      return pyodide;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to initialize Python environment: ${msg}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const runCode = async () => {
    setIsRunning(true);
    setError(null);
    setOutput("");

    try {
      const pyodide = await initPyodide();
      if (!pyodide) return;

      // Capture stdout
      let stdout = "";
      pyodide.setStdout({
        batched: (text: string) => {
          stdout += text + "\n";
          setOutput(stdout);
        },
      });

      // Clear previous output before running
      setOutput("");

      await pyodide.runPythonAsync(code);
      
      if (!stdout) {
        setOutput("(Code executed successfully with no output)");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  const reset = () => {
    setOutput("");
    setError(null);
  };

  return (
    <div className="my-6 rounded-xl border border-border overflow-hidden bg-background shadow-md">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500/10 text-emerald-600">
            <Terminal className="h-3 w-3" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Python Sandbox
          </span>
        </div>
        <div className="flex gap-2">
          {(output || error) && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}
          <button
            onClick={runCode}
            disabled={isRunning || isLoading}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all shadow-sm active:scale-95",
              isRunning || isLoading
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            )}
          >
            {isRunning || isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3 fill-current" />
            )}
            {isLoading ? "Initializing..." : isRunning ? "Running..." : "Run Code"}
          </button>
        </div>
      </div>

      {/* Code Display (readonly) */}
      <div className="relative group">
        <pre className="p-4 text-sm font-mono bg-muted/20 overflow-x-auto max-h-[300px]">
          <code className="language-python">{code}</code>
        </pre>
      </div>

      {/* Output Area */}
      {(output || error || isRunning) && (
        <div className="border-t border-border bg-black/[0.02] dark:bg-white/[0.02] p-4 min-h-[60px]">
          <div className="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            <span>Output</span>
          </div>
          
          {error ? (
            <div className="flex gap-2 text-rose-500 bg-rose-500/5 p-3 rounded-lg border border-rose-500/20 text-xs font-mono whitespace-pre-wrap break-all">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : output ? (
            <pre className="text-xs font-mono text-foreground/90 whitespace-pre-wrap break-all">
              {output}
            </pre>
          ) : isRunning ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
              <Loader2 className="h-3 w-3 animate-spin" />
              Executing Python...
            </div>
          ) : null}
        </div>
      )}
      
      <div className="px-4 py-1.5 bg-muted/20 border-t border-border/30 text-[10px] text-muted-foreground flex justify-between items-center">
        <span>Pyodide WebAssembly Sandbox</span>
        {isPyodideLoaded && <span className="flex items-center gap-1"><div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Environment Ready</span>}
      </div>
    </div>
  );
}
