import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
  signOut: vi.fn(),
}));

import { signOut, useSession } from "next-auth/react";

import { Sidebar } from "@/components/layout/Sidebar";

describe("Sidebar", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({
      data: { user: { email: "gary@example.com" } },
    } as never);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        threads: [{ id: "thread-1", title: "First thread", updatedAt: new Date().toISOString() }],
      }),
    } as never);
  });

  it("renders expanded nav labels and recent threads", async () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />);

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Roles")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("First thread")).toBeInTheDocument());
  });

  it("hides nav labels when collapsed and triggers toggle", () => {
    const onToggle = vi.fn();
    render(<Sidebar collapsed onToggle={onToggle} />);

    expect(screen.queryByText("Home")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("calls signOut from bottom user menu", async () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Account menu" }));
    const signOutItem = await screen.findByRole("menuitem", { name: "Sign out" });
    await user.click(signOutItem);
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: window.location.origin + "/" });
  });
});
