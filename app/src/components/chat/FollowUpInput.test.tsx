import { FormEvent } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FollowUpInput } from "@/components/chat/FollowUpInput";

describe("FollowUpInput", () => {
  it("submits on Enter and keeps newline on Shift+Enter", () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <FollowUpInput
          value="question"
          onChange={() => {}}
          placeholder="Ask this space"
          submitLabel="Send"
        />
      </form>,
    );

    const input = screen.getByPlaceholderText("Ask this space");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
