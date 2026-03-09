import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SearchBar } from "@/components/search/SearchBar";

describe("SearchBar", () => {
  it("renders placeholder and updates value", () => {
    const onChange = vi.fn();
    render(
      <form>
        <SearchBar
          value=""
          onChange={onChange}
          placeholder="Ask anything"
          submitLabel="Send"
        />
      </form>,
    );

    const input = screen.getByPlaceholderText("Ask anything");
    fireEvent.change(input, { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalledWith("hello");
  });

  it("disables submit button when disabled prop is true", () => {
    render(
      <form>
        <SearchBar
          value="query"
          onChange={() => {}}
          placeholder="Ask anything"
          submitLabel="Sending"
          disabled
        />
      </form>,
    );

    expect(screen.getByRole("button", { name: "Sending" })).toBeDisabled();
  });
});
