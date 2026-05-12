import { useState, useRef } from "react";
import { Message, ToolCall, OpenAIProvider, MockProvider } from "../lib/llm";
import { globalToolRegistry } from "../lib/ToolRegistry";

export interface PendingApproval {
  call: ToolCall;
  toolName: string;
}

export const useAgentLoop = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [toolResult, setToolResult] = useState<{ hint: string; data: any } | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  
  const messageTransactionRef = useRef<Message[]>([]);

  const setInitialSystemPrompt = (prompt: string) => {
    const sysMsg: Message = { role: "system", content: prompt };
    messageTransactionRef.current = [sysMsg];
    setMessages([...messageTransactionRef.current]);
  };

  const addMessage = (message: Message) => {
    messageTransactionRef.current.push(message);
    setMessages([...messageTransactionRef.current]);
  };

  const clearMessages = () => {
    if (messageTransactionRef.current.length > 0 && messageTransactionRef.current[0].role === "system") {
      messageTransactionRef.current = [messageTransactionRef.current[0]];
    } else {
      messageTransactionRef.current = [];
    }
    setMessages([...messageTransactionRef.current]);
    setToolResult(null);
    setPendingApproval(null);
  };

  const handleApproval = async (approved: boolean) => {
    if (!pendingApproval) return;
    const { call, toolName } = pendingApproval;
    setPendingApproval(null);

    if (!approved) {
      messageTransactionRef.current.push({
        role: "tool",
        content: "User denied execution of tool: " + toolName,
        tool_call_id: call.id,
        name: call.function.name
      });
      setMessages([...messageTransactionRef.current]);
      await executeLoop();
      return;
    }

    // Process the approved tool
    await processToolCall(call);
  };

  const processToolCall = async (call: ToolCall) => {
    const tool = globalToolRegistry.getTool(call.function.name);
    if (!tool) {
      messageTransactionRef.current.push({ 
        role: "system", 
        content: "Error: Tool " + call.function.name + " not found." 
      });
      setMessages([...messageTransactionRef.current]);
      return;
    }

    setActiveTool(tool.name);
    try {
      const params = JSON.parse(call.function.arguments);
      const result = await tool.execute(params);
      
      setToolResult({ hint: result.widgetHint || "", data: result.data });
      
      messageTransactionRef.current.push({ 
        role: "tool", 
        content: String(result.data), 
        tool_call_id: call.id, 
        name: call.function.name 
      });
      setMessages([...messageTransactionRef.current]);
      
      await executeLoop(); 
    } catch (e) {
      messageTransactionRef.current.push({ 
        role: "system", 
        content: "Tool execution error: " + (e as Error).message 
      });
      setMessages([...messageTransactionRef.current]);
    } finally {
      setActiveTool(null);
    }
  };

  const executeLoop = async (userContent?: string) => {
    setIsStreaming(true);
    if (userContent) {
      setToolResult(null);
      messageTransactionRef.current.push({ role: "user", content: userContent });
      setMessages([...messageTransactionRef.current]);
    }

    try {
      const isMockTool = new URLSearchParams(window.location.search).get("mock_tool") === "true";
      const useMock = new URLSearchParams(window.location.search).get("mock") === "true" || isMockTool;
      
      const lastMsg = messageTransactionRef.current[messageTransactionRef.current.length - 1];
      const provider = useMock 
        ? new MockProvider(isMockTool && lastMsg?.role !== "tool")
        : new OpenAIProvider();

      const stream = provider.stream(messageTransactionRef.current);
      
      let assistantContent = "";
      let pendingToolCalls: ToolCall[] = [];
      
      messageTransactionRef.current.push({ role: "assistant", content: "" });
      const assistantIndex = messageTransactionRef.current.length - 1;
      setMessages([...messageTransactionRef.current]);

      for await (const chunk of stream) {
        if (chunk.tool_calls) {
          pendingToolCalls = [...pendingToolCalls, ...chunk.tool_calls];
        }
        if (chunk.content) {
          assistantContent += chunk.content;
        }
        messageTransactionRef.current[assistantIndex] = { 
          role: "assistant", 
          content: assistantContent, 
          tool_calls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined 
        };
        setMessages([...messageTransactionRef.current]);
      }

      if (pendingToolCalls.length > 0) {
        for (const call of pendingToolCalls) {
          const tool = globalToolRegistry.getTool(call.function.name);
          if (tool?.parameters.requiresApproval) {
            setPendingApproval({ call, toolName: tool.name });
            setIsStreaming(false); // Stop streaming state while waiting
            return; // Break loop and wait for handleApproval
          }
          await processToolCall(call);
        }
      }
    } catch (error) {
      messageTransactionRef.current.push({ role: "system", content: "Error: " + (error as Error).message });
      setMessages([...messageTransactionRef.current]);
    } finally {
      if (!pendingApproval && messageTransactionRef.current[messageTransactionRef.current.length - 1]?.role !== "tool") {
         setIsStreaming(false);
      }
    }
  };

  return {
    messages,
    isStreaming,
    activeTool,
    toolResult,
    pendingApproval,
    executeLoop,
    addMessage,
    clearMessages,
    setInitialSystemPrompt,
    handleApproval
  };
};
