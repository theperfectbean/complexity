"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Keyboard } from "lucide-react";
import { ReactNode } from "react";

const shortcuts = [
  { key: "Cmd/Ctrl + K", action: "Open command palette" },
  { key: "Enter", action: "Send message" },
  { key: "Shift + Enter", action: "Insert newline" },
  { key: "Esc", action: "Close open dialog" },
];

type KeyboardShortcutsDialogProps = {
  trigger?: ReactNode;
};

export function KeyboardShortcutsDialog({ trigger }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Keyboard className="h-4 w-4" />
            Shortcuts
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[min(460px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-popover p-5 shadow-xl">
          <Dialog.Title className="text-lg font-semibold">Keyboard shortcuts</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">
            Faster navigation and chat interactions.
          </Dialog.Description>

          <div className="mt-4 space-y-2">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.key} className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
                <span className="text-sm">{shortcut.action}</span>
                <kbd className="rounded-md border bg-muted px-2 py-1 text-xs font-medium">{shortcut.key}</kbd>
              </div>
            ))}
          </div>

          <Dialog.Close asChild>
            <button type="button" className="mt-4 rounded-md border px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5">
              Close
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
