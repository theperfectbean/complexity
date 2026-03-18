import { render, screen } from "@testing-library/react";
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
});
