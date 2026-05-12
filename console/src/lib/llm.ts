export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface Message {
  role: MessageRole;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamChunk {
  content: string;
  done: boolean;
  tool_calls?: ToolCall[];
}

export interface LLMProvider {
  stream(messages: Message[]): AsyncGenerator<StreamChunk>;
}

export class OpenAIProvider implements LLMProvider {
  private model: string;
  constructor(model: string = "gpt-4o") {
    this.model = model;
  }

  async *stream(messages: Message[]): AsyncGenerator<StreamChunk> {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
    });

    if (!response.ok) throw new Error("LLM Request failed: " + response.statusText);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices[0].delta;
            if (delta.content) yield { content: delta.content, done: false };
            if (delta.tool_calls) yield { content: "", done: false, tool_calls: delta.tool_calls };
          } catch (e) {
            console.error("Error parsing SSE:", e);
          }
        }
      }
    }
  }
}

export class MockProvider implements LLMProvider {
  private mockTool: boolean;
  constructor(mockTool = false) {
    this.mockTool = mockTool;
  }

  async *stream(messages: Message[]): AsyncGenerator<StreamChunk> {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === "tool") {
      yield { content: "The calculation is complete and the result is " + lastMessage.content + ".", done: true };
      return;
    }
    if (this.mockTool) {
      yield { 
        content: "", 
        done: false, 
        tool_calls: [{
          id: "call_123",
          type: "function",
          function: { name: "calculator", arguments: "{\"a\": 20, \"b\": 22}" }
        }] 
      };
      yield { content: "", done: true };
      return;
    }
    yield { content: "Thinking... ", done: false };
    await new Promise(resolve => setTimeout(resolve, 500));
    yield { content: "This is a mock response for: " + lastMessage.content, done: true };
  }
}
