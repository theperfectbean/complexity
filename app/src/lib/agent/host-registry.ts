/**
 * DEPRECATED: Re-exports from unified topology
 * 
 * This file is kept for backward compatibility.
 * New code should import from @/lib/topology instead.
 */

export {
  type NodeName,
  type ContainerRole,
  type ProtocolType,
  type AuthType,
  type ServiceEndpoint,
  type FleetNode,
  type FleetContainer,
  FLEET_NODES,
  FLEET_CONTAINERS,
  getContainer,
  getNode,
  getContainersByNode,
  getContainersByTag,
  getSshCommand,
  validateTopology,
} from '@/lib/topology';

import { FLEET_NODES } from '@/lib/topology';

// Legacy compat for old agent cluster-tools.ts
export const HOST_REGISTRY = FLEET_NODES;
