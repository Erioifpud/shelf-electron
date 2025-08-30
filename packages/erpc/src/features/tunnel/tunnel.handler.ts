import type { Transport } from "@eleplug/transport";
import type { TypeHandler } from "../serialization/type.handler.js";
import type { TunnelManager } from "./tunnel-manager.js";
import type { Placeholder } from "../../types/protocol.js";

/** The placeholder for a serialized `Transport` object. */
export interface TransportPlaceholder extends Placeholder {
  _erpc_type: "transport_tunnel";
  tunnelId: string;
}

/**
 * Creates a `TypeHandler` for tunneling `Transport` objects.
 * This handler delegates the core logic of bridging and proxying to the
 * `TunnelManager`.
 * @param tunnelManager The central manager for tunnels.
 * @returns A `TypeHandler` for `Transport` objects.
 * @internal
 */
export function createTunnelHandler(
  tunnelManager: TunnelManager
): TypeHandler<Transport, TransportPlaceholder> {
  return {
    name: "transport_tunnel",

    /**
     * Identifies an object as a `Transport` via duck typing.
     */
    canHandle(value: unknown): value is Transport {
      if (typeof value !== "object" || value === null) return false;
      const candidate = value as Record<string, unknown>;
      return (
        typeof candidate.getControlChannel === "function" &&
        typeof candidate.openOutgoingStreamChannel === "function" &&
        typeof candidate.onIncomingStreamChannel === "function" &&
        typeof candidate.onClose === "function" &&
        typeof candidate.close === "function" &&
        typeof candidate.abort === "function"
      );
    },

    /**
     * Serializes a local `Transport` by bridging it through the `TunnelManager`.
     */
    serialize(transportToBridge: Transport): TransportPlaceholder {
      const tunnelId = tunnelManager.bridgeLocalTransport(transportToBridge);
      return {
        _erpc_type: "transport_tunnel",
        tunnelId,
      };
    },

    /**
     * Deserializes a placeholder into a local `ProxyTransport`.
     */
    deserialize(placeholder: TransportPlaceholder): Transport {
      return tunnelManager.getProxyForRemote(placeholder.tunnelId);
    },
  };
}
