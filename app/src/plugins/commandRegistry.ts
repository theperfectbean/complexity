export interface CommandContext {
  insertText: (text: string) => void;
  inputValue: string;
}

export interface SlashCommand {
  id: string;
  trigger: string;
  label: string;
  description: string;
  action: (context: CommandContext) => void;
}

class CommandRegistry {
  private commands: SlashCommand[] = [];

  register(command: SlashCommand) {
    if (!this.commands.find((c) => c.id === command.id)) {
      this.commands.push(command);
    }
  }

  getCommands(): SlashCommand[] {
    return this.commands;
  }

  matchCommands(query: string): SlashCommand[] {
    const lowerQuery = query.toLowerCase();
    return this.commands.filter(
      (c) =>
        c.trigger.toLowerCase().includes(lowerQuery) ||
        c.label.toLowerCase().includes(lowerQuery)
    );
  }
}

export const commandRegistry = new CommandRegistry();

// Register default commands
commandRegistry.register({
  id: "gemini-cli",
  trigger: "gemini",
  label: "Ask Gemini",
  description: "Trigger the Gemini CLI agent",
  action: (context) => {
    context.insertText("/gemini ");
  },
});

commandRegistry.register({
  id: "help-cmd",
  trigger: "help",
  label: "Help",
  description: "Show available commands",
  action: (context) => {
    context.insertText("/help ");
  },
});
