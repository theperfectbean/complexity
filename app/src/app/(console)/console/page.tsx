import type { Metadata } from "next";
import { ConsoleShell } from "@/components/agent/ConsoleShell";

export const metadata: Metadata = { title: "Console — Complexity" };

export default function ConsolePage() {
  return <ConsoleShell />;
}
