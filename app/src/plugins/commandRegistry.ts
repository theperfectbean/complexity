export interface CommandContext {
  insertText: (text: string) => void;
  inputValue: string;
  threadId?: string;
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

