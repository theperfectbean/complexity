export interface Node {
  name: string;
  ip: string;
  os: string;
  role: string;
}

export interface Container {
  name: string;
  vmid: number;
  node: string;
  purpose: string;
}

export interface Topology {
  nodes: Node[];
  containers: Container[];
  timestamp: string;
}

export const fetchTopology = async (): Promise<Topology> => {
  const response = await fetch('/api/proxmox/topology');
  if (!response.ok) {
    throw new Error('Failed to fetch topology');
  }
  return response.json();
};
