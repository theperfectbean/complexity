import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseChat = vi.fn();
const mockToastError = vi.fn();
const mockSendMessage = vi.fn();

vi.mock("@ai-sdk/react", () => ({
  useChat: (options: Record<string, unknown>) => mockUseChat(options),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ threadId: "thread-1" }),
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

import ThreadPage, { ThreadChat } from "./page";

describe("ThreadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseChat.mockReturnValue({
      messages: [],
      sendMessage: mockSendMessage,
      regenerate: vi.fn(),
      setMessages: vi.fn(),
      status: "ready",
      error: undefined,
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        thread: {
          id: "thread-1",
          title: "Thread 1",
          model: "pro-search",
        },
        messages: [],
      }),
    } as unknown as Response);
  });

  it("submits with the currently selected model in request body", async () => {
    mockSendMessage.mockResolvedValue(undefined);

    render(<ThreadPage />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Select model" }));
    await user.click(await screen.findByRole("menuitem", { name: "GPT-5.4" }));
    await user.type(screen.getByPlaceholderText("Ask a follow-up..."), "hello model");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        {
          parts: [{ type: "text", text: "hello model" }],
        },
        expect.objectContaining({
          body: expect.objectContaining({
            threadId: "thread-1",
            model: "openai/gpt-5.4",
          }),
        }),
      );
    });
  });

  it("renders inline API error banner from JSON error message", async () => {
    mockUseChat.mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      regenerate: vi.fn(),
      setMessages: vi.fn(),
      status: "error",
      error: new Error('{"error":"PERPLEXITY_API_KEY is not set"}'),
    });

    render(<ThreadPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("PERPLEXITY_API_KEY is not set");
    });
  });

  it("renders live assistant text when message content exists outside text parts", async () => {
    mockUseChat.mockReturnValue({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Summarize this week in AI chip manufacturing" }],
          content: "Summarize this week in AI chip manufacturing",
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [],
          content: [
            {
              type: "output_text",
              text: "AI chip demand rose this week, led by hyperscaler procurement and packaging capacity updates.",
            },
          ],
        },
      ],
      sendMessage: vi.fn(),
      regenerate: vi.fn(),
      setMessages: vi.fn(),
      status: "ready",
      error: undefined,
    });

    render(<ThreadPage />);

    await waitFor(() => {
      expect(screen.getByText(/AI chip demand rose this week/i)).toBeInTheDocument();
    });
  });

  it("passes trigger: 'regenerate-message' during onRetry in ThreadChat", async () => {
    const mockRegenerate = vi.fn();
    const mockSetMessages = vi.fn();
    let capturedBodyFn: (() => Record<string, unknown>) | undefined = undefined;

    mockUseChat.mockImplementation((options: { transport?: { body?: () => Record<string, unknown> } }) => {
      if (options?.transport?.body) {
        capturedBodyFn = options.transport.body;
      }
      return {
        messages: [
          { id: "msg-1", role: "user", content: "hello", parts: [{ type: "text", text: "hello" }] },
          { id: "msg-2", role: "assistant", content: "world", parts: [{ type: "text", text: "world" }] },
        ],
        sendMessage: vi.fn(),
        regenerate: mockRegenerate,
        setMessages: mockSetMessages,
        status: "ready",
        error: undefined,
      };
    });

    render(
      <ThreadChat
        threadId="thread-1"
        initialModel="pro-search"
        initialRoleId={null}
        initialHistory={[
          { id: "msg-1", role: "user", content: "hello" },
          { id: "msg-2", role: "assistant", content: "world" },
        ]}
        initialWebSearch={true}
        attachments={[]}
        setAttachments={vi.fn()}
      />
    );

    const user = userEvent.setup();
    const retryButtons = await screen.findAllByRole("button", { name: "Retry" });
    await user.click(retryButtons[retryButtons.length - 1]);

    await waitFor(() => {
      expect(mockSetMessages).toHaveBeenCalled();
      expect(mockRegenerate).toHaveBeenCalledWith({ messageId: "msg-2" });
      
      if (!capturedBodyFn) throw new Error("Body function not captured");
      const body = capturedBodyFn();
      expect(body).toMatchObject({
        trigger: "regenerate-message",
      });
    });
  });

  it("passes trigger: 'regenerate-message' and new model during onRewrite in ThreadChat", async () => {
    const mockRegenerate = vi.fn();
    const mockSetMessages = vi.fn();
    let capturedBodyFn: (() => Record<string, unknown>) | undefined = undefined;

    mockUseChat.mockImplementation((options: { transport?: { body?: () => Record<string, unknown> } }) => {
      if (options?.transport?.body) {
        capturedBodyFn = options.transport.body;
      }
      return {
        messages: [
          { id: "msg-1", role: "user", content: "hello", parts: [{ type: "text", text: "hello" }] },
          { id: "msg-2", role: "assistant", content: "world", parts: [{ type: "text", text: "world" }] },
        ],
        sendMessage: vi.fn(),
        regenerate: mockRegenerate,
        setMessages: mockSetMessages,
        status: "ready",
        error: undefined,
      };
    });

    // Mock models API for the rewrite dropdown
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { id: "model-a", label: "Model A", category: "Test", isPreset: true },
          { id: "model-b", label: "Model B", category: "Test", isPreset: true },
        ],
      }),
    } as unknown as Response);

    render(
      <ThreadChat
        threadId="thread-1"
        initialModel="model-a"
        initialRoleId={null}
        initialHistory={[
          { id: "msg-1", role: "user", content: "hello" },
          { id: "msg-2", role: "assistant", content: "world" },
        ]}
        initialWebSearch={true}
        attachments={[]}
        setAttachments={vi.fn()}
      />
    );

    const user = userEvent.setup();
    const rewriteButtons = await screen.findAllByRole("button", { name: "Rewrite with another model" });
    await user.click(rewriteButtons[rewriteButtons.length - 1]);

    const modelBItem = await screen.findByRole("menuitem", { name: "Model B" });
    await user.click(modelBItem);

    await waitFor(() => {
      expect(mockSetMessages).toHaveBeenCalled();
      expect(mockRegenerate).toHaveBeenCalledWith({ messageId: "msg-2" });

      if (!capturedBodyFn) throw new Error("Body function not captured");
      const body = capturedBodyFn();
      expect(body).toMatchObject({
        trigger: "regenerate-message",
        model: "model-b",
      });
    });
  });
});
