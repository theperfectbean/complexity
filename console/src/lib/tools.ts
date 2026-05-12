export interface ToolResultEnvelope<T = any> {
  data: T;
  widgetHint?: string;
  requiresApproval?: boolean;
}

export abstract class BaseTool<P = any, R = any> {
  abstract name: string;
  abstract description: string;
  abstract parameters: Record<string, any>;
  abstract execute(params: P): Promise<ToolResultEnvelope<R>>;
}

export class CalculatorTool extends BaseTool<{ a: number; b: number }, number> {
  name = "calculator";
  description = "Perform basic math calculations";
  parameters = {
    type: "object",
    properties: {
      a: { type: "number" },
      b: { type: "number" },
    },
    required: ["a", "b"],
  };

  async execute(params: { a: number; b: number }): Promise<ToolResultEnvelope<number>> {
    return {
      data: params.a + params.b,
      widgetHint: "calculator-widget",
    };
  }
}
