import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseChat = vi.fn();
const mockToastError = vi.fn();
const mockSendMessage = vi.fn();

vi.mock("@ai-sdk/react", () => ({
  useChat: (...args: unknown[]) => mockUseChat(...args),
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

import ThreadPage from "./page";

describe("ThreadPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseChat.mockReturnValue({
      messages: [],
      sendMessage: mockSendMessage,
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
    } as never);
  });

  it("submits with the currently selected model in request body", async () => {
    mockSendMessage.mockResolvedValue(undefined);

    render(<ThreadPage />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Select model" }));
    await user.click(await screen.findByRole("menuitem", { name: "GPT-5.2" }));
    await user.type(screen.getByPlaceholderText("Ask anything"), "hello model");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        { text: "hello model" },
        {
          body: {
            threadId: "thread-1",
            model: "openai/gpt-5.2",
          },
        },
      );
    });
  });

  it("renders inline API error banner from JSON error message", async () => {
    mockUseChat.mockReturnValue({
      messages: [],
      sendMessage: vi.fn(),
      status: "error",
      error: new Error('{"error":"PERPLEXITY_API_KEY is not set"}'),
    });

    render(<ThreadPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("PERPLEXITY_API_KEY is not set");
    });
  });
});
