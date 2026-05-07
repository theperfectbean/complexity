import { FormEvent } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchBar } from "@/components/search/SearchBar";

describe("SearchBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders placeholder and updates value", () => {
    const onChange = vi.fn();
    const onModelChange = vi.fn();
    render(
      <form>
        <SearchBar
          value=""
          onChange={onChange}
          placeholder="Ask anything"
          submitLabel="Send"
          model="pro-search"
          onModelChange={onModelChange}
          autoFilter={false}
        />
      </form>,
    );

    const input = screen.getByPlaceholderText("Ask anything");
    fireEvent.change(input, { target: { value: "hello" } });
    expect(onChange).toHaveBeenCalledWith("hello");

    expect(screen.getByRole("button", { name: "Select model" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Attach file" })).toBeInTheDocument();
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
          autoFilter={false}
        />
      </form>,
    );

    expect(screen.getByRole("button", { name: "Sending" })).toBeDisabled();
  });

  it("opens model dropdown and selects a model", async () => {
    const onModelChange = vi.fn();
    render(
      <form>
        <SearchBar
          value="query"
          onChange={() => {}}
          placeholder="Ask anything"
          submitLabel="Send"
          model="model-a"
          modelOptions={[
            { id: "model-a", label: "Model A", category: "Presets", isPreset: true },
            { id: "model-b", label: "Model B", category: "Presets", isPreset: true },
          ]}
          onModelChange={onModelChange}
          autoFilter={false}
        />
      </form>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Select model" }));
    await user.click(await screen.findByRole("menuitem", { name: "Model B" }));

    expect(onModelChange).toHaveBeenCalledWith("model-b");
  });

  it("submits on Enter and keeps newline on Shift+Enter", () => {
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());

    render(
      <form onSubmit={onSubmit}>
        <SearchBar value="query" onChange={() => {}} placeholder="Ask anything" submitLabel="Send" autoFilter={false} />
      </form>,
    );

    const input = screen.getByPlaceholderText("Ask anything");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(input, { key: "Enter", code: "Enter", shiftKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("renders microphone button when audio recording is supported", () => {
    // Mock navigator.mediaDevices.getUserMedia
    const mockGetUserMedia = vi.fn().mockResolvedValue(null);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: mockGetUserMedia,
      },
    });

    render(
      <form>
        <SearchBar value="" onChange={() => {}} placeholder="Ask anything" submitLabel="Send" autoFilter={false} />
      </form>,
    );

    expect(screen.getByRole("button", { name: "Start listening" })).toBeInTheDocument();
    
    vi.unstubAllGlobals();
  });
});
