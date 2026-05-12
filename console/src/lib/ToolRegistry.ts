import { BaseTool, CalculatorTool } from "./tools";

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  constructor() {
    this.register(new CalculatorTool());
  }

  register(tool: BaseTool) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): BaseTool[] {
    return Array.from(this.tools.values());
  }
}

export const globalToolRegistry = new ToolRegistry();
