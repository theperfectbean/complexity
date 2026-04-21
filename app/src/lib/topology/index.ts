/**
 * Topology exports
 * 
 * Import from this file instead of importing directly from FleetTopology.
 * This allows us to add adapters, migrations, or transformations as needed.
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
} from './FleetTopology';
