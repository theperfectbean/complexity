import { randomUUID } from "node:crypto";

export type OpenAIToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
    strict?: boolean;
  };
};

export type OpenAIToolChoice =
  | "none"
  | "auto"
  | {
      type: "function";
      function: {
        name: string;
      };
    };

export type OpenAIToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

function stringifyArguments(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

export function buildToolInstructions(tools: OpenAIToolDefinition[], toolChoice?: OpenAIToolChoice) {
  if (!tools.length) {
    return "";
  }

  const lines: string[] = [
    "You are operating in OpenAI-compatible function-calling mode.",
    "Respond in JSON only.",
    "If you need a tool, return an object with `tool_calls` as an array of calls.",
    "Each call must use the shape: { \"id\": \"call_...\", \"type\": \"function\", \"function\": { \"name\": \"tool_name\", \"arguments\": \"{...}\" } }.",
    "If no tool is needed, return { \"content\": \"...\" }.",
  ];

  if (toolChoice === "none") {
    lines.push("Do not call any tools.");
  } else if (toolChoice === "auto" || !toolChoice) {
    lines.push("Use the tools only when they are helpful.");
  } else {
    lines.push(`You must call the function named "${toolChoice.function.name}" if a tool is used.`);
  }

  lines.push("Available tools:");
  for (const tool of tools) {
    lines.push(`- ${tool.function.name}${tool.function.description ? `: ${tool.function.description}` : ""}`);
    if (tool.function.parameters) {
      lines.push(`  parameters: ${JSON.stringify(tool.function.parameters)}`);
    }
  }

  return lines.join("\n");
}

export function parseToolCallPayload(text: string, tools: OpenAIToolDefinition[]): {
  content: string;
  toolCalls: OpenAIToolCall[] | null;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { content: "", toolCalls: null };
  }

  const toolNames = new Set(tools.map((tool) => tool.function.name));

  const normalizeCall = (call: Record<string, unknown>): OpenAIToolCall | null => {
    const functionBlock = call.function as Record<string, unknown> | undefined;
    const name =
      (typeof call.name === "string" && call.name) ||
      (functionBlock && typeof functionBlock.name === "string" && functionBlock.name) ||
      "";
    if (!name || (toolNames.size > 0 && !toolNames.has(name))) {
      return null;
    }

    const callId = typeof call.id === "string" && call.id ? call.id : `call_${randomUUID().replace(/-/g, "")}`;
    const argsValue =
      (functionBlock && "arguments" in functionBlock ? functionBlock.arguments : call.arguments) ?? {};

    return {
      id: callId,
      type: "function",
      function: {
        name,
        arguments: stringifyArguments(argsValue),
      },
    };
  };

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const directCalls = Array.isArray(parsed.tool_calls)
      ? parsed.tool_calls
      : Array.isArray(parsed.tool_call)
        ? parsed.tool_call
        : null;

    if (directCalls) {
      const toolCalls = directCalls
        .map((item) => (item && typeof item === "object" ? normalizeCall(item as Record<string, unknown>) : null))
        .filter((item): item is OpenAIToolCall => Boolean(item));
      if (toolCalls.length > 0) {
        return {
          content: typeof parsed.content === "string" ? parsed.content : "",
          toolCalls,
        };
      }
    }

    const singleCall = normalizeCall(parsed);
    if (singleCall) {
      return {
        content: typeof parsed.content === "string" ? parsed.content : "",
        toolCalls: [singleCall],
      };
    }

    if (typeof parsed.content === "string") {
      return { content: parsed.content, toolCalls: null };
    }
  } catch {
    // Not JSON. Fall back to plain text.
  }

  return { content: trimmed, toolCalls: null };
}
