import type { OutgoingStreamChannel, ChannelId, JsonValue, IncomingStreamChannel } from '@eleplug/transport';
import type { Feature } from '../../runtime/framework/feature.js';
import { StreamManager, type StreamProcessingContext } from './stream-manager';
import { createStreamHandler } from './stream.handler';
import type { TransportAdapterContribution } from '../transport/transport.adapter.feature.js';
import type { SerializationContribution } from '../serialization/serialization.feature.js';
import type { ProtocolHandlerContribution } from '../protocol/protocol.handler.feature.js';
import type { TunnelContribution } from '../tunnel/tunnel.feature.js';
import type { StreamAckMessage, StreamTunnelMessage } from '../../types/protocol.js';

export interface StreamContribution {
  streamManager: StreamManager;
  createPushWriter: (handshakeId: string) => WritableStream<JsonValue>;
  openPullReader: (handshakeId: string) => ReadableStream<JsonValue>;
}

type StreamCapability = TransportAdapterContribution & SerializationContribution & ProtocolHandlerContribution & TunnelContribution;

/** A simple manager for tracking streams awaiting acknowledgment. @internal */
class AckManager {
  private pendingAcks = new Map<ChannelId, { resolve: () => void; reject: (reason?: any) => void }>();

  public waitForAck(channelId: ChannelId): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pendingAcks.set(channelId, { resolve, reject });
    });
  }

  public handleAck(channelId: ChannelId): void {
    this.pendingAcks.get(channelId)?.resolve();
    this.pendingAcks.delete(channelId);
  }

  public clearAll(error: Error): void {
    for (const promise of this.pendingAcks.values()) {
      promise.reject(error);
    }
    this.pendingAcks.clear();
  }
}

/**
 * A feature that provides support for streaming data using WHATWG Streams.
 *
 * It coordinates the `StreamManager` for handling incoming data, integrates
 * with the `SerializationFeature` via a `StreamHandler`, and provides APIs
 * for creating push-based writers and pull-based readers. It also routes
 * streams to the `TunnelFeature` when necessary.
 */
export class StreamFeature implements Feature<StreamContribution, StreamCapability> {
  private streamManager: StreamManager;
  private capability!: StreamCapability;
  private readonly ackManager = new AckManager();

  constructor(streamManager: StreamManager) {
    this.streamManager = streamManager;
    this.streamManager.acquire();
  }

  public contribute(): StreamContribution {
    return {
      streamManager: this.streamManager,
      createPushWriter: this.createPushWriter.bind(this),
      openPullReader: (handshakeId) => this.streamManager.createPullReader(handshakeId),
    };
  }

  public init(capability: StreamCapability): void {
    this.capability = capability;

    // Listen for new incoming stream channels from the transport layer.
    capability.rawEmitter.on('incomingStreamChannel', (channel: IncomingStreamChannel) => {
      // Assemble the context required by the StreamManager for processing.
      const streamProcessingContext: StreamProcessingContext = {
        serializer: capability.serializer,
        sendRawMessage: capability.sendRawMessage,
        routeTunneledStream: (chan: IncomingStreamChannel, msg: StreamTunnelMessage) => capability.routeIncomingStream(chan, msg),
      };
      // Delegate routing to the manager.
      this.streamManager.routeIncomingStreamChannel(channel, streamProcessingContext);
    });

    // Listen for stream acknowledgment messages.
    capability.semanticEmitter.on('streamAck', (message: StreamAckMessage) => {
      this.ackManager.handleAck(message.channelId);
    });

    // Register the stream handler with the serialization system.
    const handlerCapability = { ...capability, ...this.contribute() };
    const streamHandler = createStreamHandler(handlerCapability);
    capability.serializer.registerHandler(streamHandler);
  }

  /**
   * Creates a push-based `WritableStream`. Data written to this stream will be
   * sent to the remote peer over a dedicated stream channel.
   * @param handshakeId A unique ID to link this writer with a remote reader.
   * @returns A WHATWG `WritableStream`.
   */
  private createPushWriter(handshakeId: string): WritableStream<JsonValue> {
    if (!this.capability) {
      throw new Error('StreamFeature is not initialized.');
    }

    let channel: OutgoingStreamChannel | null = null;

    return new WritableStream({
      write: async (chunk) => {
        const serializedChunk = this.capability.serializer.serialize(chunk);
        if (!channel) {
          // On first write, open a new channel and send the handshake message.
          channel = await this.capability.openOutgoingStreamChannel();
          await channel.send({ type: 'stream-data', chunk: serializedChunk, handshakeId });
        } else {
          await channel.send({ type: 'stream-data', chunk: serializedChunk });
        }
      },
      close: async () => {
        if (channel) {
          try {
            await channel.send({ type: 'stream-end' });
            // Wait for the remote peer to acknowledge full consumption before closing.
            await this.ackManager.waitForAck(channel.id);
          } catch (err) {
            console.error(`[StreamFeature] Graceful close failed for channel ${channel?.id}:`, err);
          } finally {
            // Always attempt to close the underlying channel.
            await channel.close().catch(() => { /* ignore */ });
          }
        }
      },
      abort: async (reason) => {
        if (channel) {
          try {
            // Notify the remote peer of the abortion.
            await channel.send({ type: 'stream-abort', reason });
          } catch (err) {
            // Ignore send errors, as we are aborting anyway.
          } finally {
            // Immediately close the underlying channel without waiting for an ack.
            await channel.close().catch(() => { /* ignore */ });
          }
        }
      },
    });
  }

  public close(_contribution: StreamContribution, error?: Error): void {
    // Clean up all pending acknowledgments and release the manager.
    this.ackManager.clearAll(error ?? new Error('Operation aborted due to StreamFeature shutdown.'));
    this.streamManager.release(error);
  }
}