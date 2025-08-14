import { v4 as uuid } from 'uuid';
import type { ControlChannel, IncomingStreamChannel, JsonValue, MaybePromise, OutgoingStreamChannel, Transport } from '@eleplug/transport';
import { ProxyTransport } from './proxy-transport.js';
import type { ControlMessage, StreamTunnelMessage } from '../../types/protocol.js';

/** Represents a "bridged" local transport, holding its state. @internal */
type BridgeEntry = {
  transport: Transport;
  controlChannel: ControlChannel | null;
  pendingMessages: ControlMessage[];
};

/**
 * Manages all tunneled transports, acting as a central router.
 *
 * It handles two main roles:
 * 1. **Bridging**: Connecting a real, local `Transport` instance to the host
 *    connection, allowing it to be used by the remote peer. This is initiated
 *    when a local `Transport` is serialized.
 * 2. **Proxying**: Creating a local `ProxyTransport` object that represents a
 *    remote `Transport`. This is initiated when a `Transport` placeholder is
 *    deserialized.
 *
 * @internal
 */
export class TunnelManager {
  private readonly bridges = new Map<string, BridgeEntry>();
  private readonly proxies = new Map<string, ProxyTransport>();

  private readonly hostSend: (message: ControlMessage) => Promise<void>;
  private readonly hostOpenStream: () => Promise<OutgoingStreamChannel>;

  constructor(capability: {
    sendRawMessage: (message: ControlMessage) => Promise<void>;
    openOutgoingStreamChannel: () => Promise<OutgoingStreamChannel>;
  }) {
    this.hostSend = capability.sendRawMessage;
    this.hostOpenStream = capability.openOutgoingStreamChannel;
  }

  /**
   * "Bridges" a local transport, making it accessible to the remote peer.
   * @param localTransport The local `Transport` instance to bridge.
   * @returns The unique `tunnelId` for this new bridge.
   */
  public bridgeLocalTransport(localTransport: Transport): string {
    const tunnelId = uuid();
    const entry: BridgeEntry = { transport: localTransport, controlChannel: null, pendingMessages: [] };
    this.bridges.set(tunnelId, entry);

    // When the local transport closes for any reason, clean up the bridge.
    localTransport.onClose(() => this.cleanupBridge(tunnelId));

    localTransport.getControlChannel().then(channel => {
      if (!this.bridges.has(tunnelId)) { channel.close().catch(() => {}); return; }
      entry.controlChannel = channel;
      channel.onClose(() => this.cleanupBridge(tunnelId));

      // Forward messages from the bridged transport to the host.
      channel.onMessage((payload: JsonValue) => {
        this.hostSend({ type: 'tunnel', tunnelId, payload: payload as ControlMessage }).catch(err => {
          console.error(`[TunnelManager] Failed to forward message from tunnel ${tunnelId}:`, err);
          this.cleanupBridge(tunnelId, err as Error);
        });
      });

      // Send any queued messages.
      while (entry.pendingMessages.length > 0) {
        channel.send(entry.pendingMessages.shift()!).catch(err => {
          console.error(`[TunnelManager] Error sending queued message to bridged transport ${tunnelId}:`, err);
        });
      }
    }).catch(err => {
      console.error(`[TunnelManager] Failed to setup control channel for tunnel ${tunnelId}:`, err);
      this.cleanupBridge(tunnelId, err);
    });

    // Forward streams from the bridged transport to the host.
    localTransport.onIncomingStreamChannel(localIncomingChannel => {
      if (this.bridges.has(tunnelId)) {
        this.forwardIncomingStreamFromBridge(tunnelId, localIncomingChannel);
      }
    });

    return tunnelId;
  }

  /**
   * Creates or retrieves a proxy for a remote transport.
   * @param tunnelId The ID of the remote transport.
   * @returns A `ProxyTransport` instance.
   */
  public getProxyForRemote(tunnelId: string): ProxyTransport {
    let proxy = this.proxies.get(tunnelId);
    if (!proxy) {
      proxy = new ProxyTransport(
        tunnelId,
        (payload) => this.hostSend({ type: 'tunnel', tunnelId, payload }),
        async () => {
          const hostOutgoingChannel = await this.hostOpenStream();
          await hostOutgoingChannel.send({ type: 'stream-tunnel', tunnelId, streamId: uuid(), targetEndpoint: 'initiator' });
          return hostOutgoingChannel;
        }
      );
      this.proxies.set(tunnelId, proxy);
    }
    return proxy;
  }

  /**
   * Routes an incoming stream from the host to the correct bridge or proxy.
   * @param hostIncomingChannel The incoming stream channel from the host transport.
   * @param message The handshake message containing routing information.
   */
  public async routeIncomingStream(hostIncomingChannel: IncomingStreamChannel, message: StreamTunnelMessage): Promise<void> {
    const { tunnelId, targetEndpoint } = message;

    if (targetEndpoint === 'initiator') {
      const bridgeEntry = this.bridges.get(tunnelId);
      if (bridgeEntry) {
        const localOutgoingChannel = await bridgeEntry.transport.openOutgoingStreamChannel();
        this.pumpStream(hostIncomingChannel, localOutgoingChannel);
        return;
      }
    }

    if (targetEndpoint === 'receiver') {
      const proxy = this.proxies.get(tunnelId);
      if (proxy) {
        proxy._handleIncomingStream(hostIncomingChannel);
        return;
      }
    }

    console.warn(`[TunnelManager] Received stream for unknown tunnel ${tunnelId} or mismatched target ${targetEndpoint}`);
    hostIncomingChannel.close().catch(() => {});
  }

  /**
   * Routes an incoming control message from the host to the correct bridge or proxy.
   * @param tunnelId The ID of the target tunnel.
   * @param payload The control message to route.
   */
  public routeIncomingMessage(tunnelId: string, payload: ControlMessage): void {
    const bridgeEntry = this.bridges.get(tunnelId);
    if (bridgeEntry) {
      if (bridgeEntry.controlChannel) {
        bridgeEntry.controlChannel.send(payload).catch(err => { console.error(`[TunnelManager] Error sending message to bridged transport ${tunnelId}:`, err); });
      } else {
        bridgeEntry.pendingMessages.push(payload);
      }
      return;
    }

    const proxy = this.proxies.get(tunnelId);
    if (proxy) {
      proxy._handleIncomingMessage(payload);
      return;
    }
    console.warn(`[TunnelManager] Received message for unknown tunnelId: ${tunnelId}`);
  }

  /** Destroys all bridges and proxies, typically on host connection closure. */
  public destroyAll(error: Error): void {
    for (const tunnelId of this.bridges.keys()) {
      this.cleanupBridge(tunnelId, error);
    }
    for (const proxy of this.proxies.values()) {
      proxy._handleClose(error);
    }
    this.proxies.clear();
  }

  private cleanupBridge(tunnelId: string, reason?: Error): void {
    const entry = this.bridges.get(tunnelId);
    if (entry) {
      this.bridges.delete(tunnelId);
      // If cleanup is forced (e.g., host closed), also close the underlying transport.
      entry.transport.close().catch(() => {});
    }
  }

  private forwardIncomingStreamFromBridge(tunnelId: string, localIncomingChannel: IncomingStreamChannel): void {
    const destinationProvider = (async () => {
      const hostOutgoingChannel = await this.hostOpenStream();
      await hostOutgoingChannel.send({ type: 'stream-tunnel', tunnelId, streamId: uuid(), targetEndpoint: 'receiver' });
      return hostOutgoingChannel;
    })();
    this.pumpStream(localIncomingChannel, destinationProvider);
  }

  /**
   * Pumps data and close events bidirectionally between two stream channels.
   * @param source The source channel.
   * @param destination The destination channel (or a promise for it).
   */
  private async pumpStream(source: IncomingStreamChannel, destination: MaybePromise<OutgoingStreamChannel>): Promise<void> {
    try {
      const dest = await destination;
      let isCleanedUp = false;

      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        source.close().catch(() => {});
        dest.close().catch(() => {});
      };

      source.onData(async (message) => {
        if (isCleanedUp) return;
        try {
          await dest.send(message);
        } catch {
          cleanup();
        }
      });

      source.onClose(cleanup);
      dest.onClose(cleanup);
    } catch {
      source.close().catch(()=>{});
    }
  }
}