export interface NodeStatus {
  id: string;
  status: "online" | "offline";
  cpu: number;
  memory: number;
}

export interface InfraState {
  nodes: NodeStatus[];
  timestamp: string;
}

export const fetchInfraState = async (): Promise<InfraState> => {
  // In a real scenario, this hits the Next.js app/ API contract
  // For now, we return a mock that represents the 3-node homelab
  return {
    nodes: [
      { id: "node01", status: "online", cpu: 0.12, memory: 0.45 },
      { id: "node02", status: "online", cpu: 0.08, memory: 0.32 },
      { id: "node03", status: "online", cpu: 0.05, memory: 0.15 },
    ],
    timestamp: new Date().toISOString(),
  };
};

export const generateSystemPrompt = (state: InfraState, userSettings: any): string => {
  const nodeInfo = state.nodes
    .map(n => "- " + n.id + ": " + n.status + " (CPU: " + (n.cpu * 100).toFixed(0) + "%, MEM: " + (n.memory * 100).toFixed(0) + "%)")
    .join("\\n");

  return "You are a CLI-Grade Web Agent for the Complexity homelab.\\n" +
    "Current Infrastructure State:\\n" + nodeInfo + "\\n\\n" +
    "Current Model: " + userSettings.model + "\\n" +
    "Maintain a professional, direct, and concise tone. Focus on infrastructure health and service availability.";
};
