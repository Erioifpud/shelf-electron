import type { IncomingStreamChannel } from "@eleplug/transport";
import type { Feature } from "../../runtime/framework/feature.js";
import type { ProtocolHandlerContribution } from "../protocol/protocol.handler.feature.js";
import type { SerializationContribution } from "../serialization/serialization.feature.js";
import type { TransportAdapterContribution } from "../transport/transport.adapter.feature.js";
import { TunnelManager } from "./tunnel-manager.js";
import { createTunnelHandler } from "./tunnel.handler.js";
import type {
  ControlMessage,
  StreamTunnelMessage,
} from "../../types/protocol.js";

/**
 * The capabilities contributed by the `TunnelFeature`.
 */
export interface TunnelContribution {
  /** The central manager for all tunneled transports. */
  tunnelManager: TunnelManager;
  /**
   * An internal routing function used by `StreamFeature` to forward
   * tunneled streams to the `TunnelManager`.
   * @internal
   */
  routeIncomingStream: (
    channel: IncomingStreamChannel,
    message: StreamTunnelMessage
  ) => Promise<void>;
}

type TunnelRequires = TransportAdapterContribution &
  SerializationContribution &
  ProtocolHandlerContribution;

/**
 * A feature that enables transport tunneling (multiplexing virtual transports
 * over a single real transport).
 *
 * This feature orchestrates the `TunnelManager` and integrates `Transport`
 * serialization into the erpc system, allowing a `Transport` object to be
- * passed as a procedure argument or return value.
 */
export class TunnelFeature
  implements Feature<TunnelContribution, TunnelRequires>
{
  private tunnelManager!: TunnelManager;

  public contribute(): TunnelContribution {
    return {
      tunnelManager: null as any, // The real instance is created in `init`.
      routeIncomingStream: async (channel, message) => {
        if (!this.tunnelManager) {
          throw new Error(
            "TunnelManager not initialized when routeIncomingStream was called."
          );
        }
        return this.tunnelManager.routeIncomingStream(channel, message);
      },
    };
  }

  public init(capability: TunnelRequires & TunnelContribution): void {
    // 1. Create the manager with its required low-level capabilities.
    this.tunnelManager = new TunnelManager(capability);
    // Back-fill the manager instance into the contributed object.
    capability.tunnelManager = this.tunnelManager;

    // 2. Register the handler for serializing/deserializing `Transport` objects.
    const handler = createTunnelHandler(this.tunnelManager);
    capability.serializer.registerHandler(handler);

    // 3. Listen for raw messages and route 'tunnel' type messages to the manager.
    capability.rawEmitter.on("message", (message: ControlMessage) => {
      if (message.type === "tunnel") {
        this.tunnelManager.routeIncomingMessage(
          message.tunnelId,
          message.payload
        );
      }
    });

    // 4. When the host transport closes, destroy all tunnels.
    capability.rawEmitter.on("close", (reason) => {
      this.tunnelManager.destroyAll(
        reason ?? new Error("Host transport closed.")
      );
    });
  }

  public close(_contribution: TunnelContribution, error?: Error): void {
    if (this.tunnelManager) {
      this.tunnelManager.destroyAll(
        error ?? new Error("erpc node is closing.")
      );
    }
  }
}
