export type ChatRoutingDecision = {
  useRag: boolean;
  useMemory: boolean;
  allowWebSearch: boolean;
  route: "plain" | "memory" | "rag" | "web";
};

type ChatRoutingInput = {
  userText: string;
  roleId?: string | null;
  memoryEnabled?: boolean | null;
  webSearchRequested?: boolean;
  webSearchExplicit?: boolean;
};

const RAG_SIGNALS = [
  "document",
  "documents",
  "file",
  "files",
  "pdf",
  "docx",
  "txt",
  "markdown",
  "md",
  "uploaded",
  "upload",
  "knowledge base",
  "knowledgebase",
  "according to",
  "from the docs",
  "from my docs",
  "in the docs",
  "in the files",
  "based on the files",
  "use the role",
  "use the documents",
  "what does the document say",
];

const MEMORY_SIGNALS = [
  "remember",
  "my preference",
  "my preferences",
  "for me",
  "about me",
  "as i said",
  "last time",
  "my setup",
  "my workflow",
  "my project",
  "i prefer",
  "i like",
  "i dislike",
  "always use",
  "never use",
];

const WEB_SIGNALS = [
  "today",
  "latest",
  "news",
  "current",
  "currently",
  "recent",
  "this week",
  "this month",
  "price",
  "prices",
  "release date",
  "stock",
  "weather",
  "score",
  "standings",
  "who is the ceo",
  "who is the president",
];

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

export function shouldUseRag(userText: string): boolean {
  const normalized = normalize(userText);
  if (!normalized) return false;
  return RAG_SIGNALS.some((signal) => new RegExp("\\b" + signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(normalized));
}

const SHORT_MEMORY_SIGNALS = [
  "again",
  "as before",
  "previous",
  "yesterday",
  "last time",
  "earlier",
];

export function shouldUseMemory(userText: string): boolean {
  const normalized = normalize(userText);
  if (!normalized) return false;

  // Check explicit signals
  if (MEMORY_SIGNALS.some((signal) => new RegExp("\\b" + signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(normalized))) {
    return true;
  }

  // Check short context-dependent signals
  if (SHORT_MEMORY_SIGNALS.some((signal) => new RegExp("\\b" + signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(normalized))) {
    return true;
  }

  // Heuristic for substantive personal messages (exclude questions)
  const isQuestion = normalized.endsWith("?") || normalized.startsWith("who") || normalized.startsWith("what") || normalized.startsWith("how") || normalized.startsWith("why") || normalized.startsWith("when");
  
  return !isQuestion && /\b(i|my|me)\b/.test(normalized) && normalized.split(/\s+/).length >= 25;
}

export function shouldUseWebSearch(userText: string): boolean {
  const normalized = normalize(userText);
  if (!normalized) return false;
  return WEB_SIGNALS.some((signal) => new RegExp("\\b" + signal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(normalized));
}

export function getChatRoutingDecision(input: ChatRoutingInput): ChatRoutingDecision {
  const useRag = !!input.roleId && shouldUseRag(input.userText);
  const useMemory = !!input.memoryEnabled && shouldUseMemory(input.userText);

  let allowWebSearch = false;
  if (input.webSearchExplicit) {
    allowWebSearch = !!input.webSearchRequested;
  } else if (!useRag) {
    allowWebSearch = shouldUseWebSearch(input.userText);
  }

  const route = allowWebSearch ? "web" : useRag ? "rag" : useMemory ? "memory" : "plain";

  return { useRag, useMemory, allowWebSearch, route };
}
