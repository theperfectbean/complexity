import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MessageList } from "@/components/chat/MessageList";

describe("MessageList", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders empty label", () => {
    render(<MessageList messages={[]} emptyLabel="Nothing yet" />);
    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
  });

  it("renders assistant markdown and citations", () => {
    render(
      <MessageList
        emptyLabel="Nothing"
        messages={[
          {
            id: "1",
            role: "assistant",
            content: "**Hello** world",
            citations: [{ url: "https://example.com" }],
          },
        ]}
      />,
    );

    expect(screen.getByText("Hello", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("https://example.com")).toBeInTheDocument();
  });

  it("invokes related question callback", () => {
    const onRelatedQuestionClick = vi.fn();

    render(
      <MessageList
        emptyLabel="Nothing"
        onRelatedQuestionClick={onRelatedQuestionClick}
        messages={[
          {
            id: "1",
            role: "assistant",
            content: "What is RAG? How does retrieval work?",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "How does retrieval work?" }));
    expect(onRelatedQuestionClick).toHaveBeenCalledWith("How does retrieval work?");
  });
});
