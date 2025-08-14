import type { ChannelId, IncomingStreamChannel, JsonValue } from '@eleplug/transport';
import { IncomingBuffer, BufferClosedError } from '../../utils/incoming-buffer.js';
import type { TypeHandler } from '../serialization/type.handler.js';
import type { ControlMessage, StreamMessage, StreamTunnelMessage } from '../../types/protocol.js';

/**
 * Defines the context (dependencies) required to process a single stream channel.
 * This context is provided by the calling feature (e.g., `StreamFeature`).
 * @internal
 */
export interface StreamProcessingContext {
  serializer: {
    serialize: (value: any) => JsonValue;
    deserialize: (value: JsonValue) => any;
    registerHandler: (handler: TypeHandler<any, any>) => void;
  };
  sendRawMessage: (msg: ControlMessage) => Promise<void>;
  routeTunneledStream: (channel: IncomingStreamChannel, message: StreamTunnelMessage) => Promise<void>;
}

/** The subset of context needed for processing a single stream message. @internal */
type MessageProcessingContext = Pick<StreamProcessingContext, 'serializer' | 'sendRawMessage'>;

/** Represents the state of a stream waiting for its handshake message. @internal */
type PendingHandshake = {
  buffer: IncomingBuffer;
  resolve: (value: ChannelId | PromiseLike<ChannelId>) => void;
  reject: (reason?: any) => void;
};

/**
 * A shareable manager for handling non-tunneled data streams.
 *
 * It manages incoming stream buffers, handshakes, and data deserialization.
 * It is designed to be stateless regarding any specific connection; all
 * connection-specific dependencies are injected via the `context` parameter
 * in its methods. Its lifecycle is managed via a use counter.
 */
export class StreamManager {
  private readonly buffers = new Map<ChannelId, IncomingBuffer>();
  private readonly pendingHandshakes = new Map<string, PendingHandshake>();
  private useCount = 0;

  /** Increments the manager's use counter. */
  public acquire(): void {
    this.useCount++;
  }

  /** Decrements the use counter. When it reaches zero, all resources are destroyed. */
  public release(error?: Error): void {
    this.useCount--;
    if (this.useCount <= 0) {
      this.destroy(error ?? new Error('StreamManager destroyed as last user has released it.'));
    }
  }

  /** Destroys all buffers and rejects all pending handshakes. */
  private destroy(error: Error): void {
    for (const pending of this.pendingHandshakes.values()) {
      pending.reject(error);
    }
    this.pendingHandshakes.clear();
    for (const buffer of this.buffers.values()) {
      buffer.destroy(error);
    }
    this.buffers.clear();
  }

  /**
   * The entry point for handling a new incoming stream channel from the transport.
   * It inspects the first message to determine if the stream is standard or tunneled.
   * @param channel The new incoming stream channel.
   * @param context The dependencies required for processing.
   */
  public routeIncomingStreamChannel(channel: IncomingStreamChannel, context: StreamProcessingContext): void {
    let isHandled = false;

    const onFirstMessage = (raw_message: JsonValue) => {
      if (isHandled) return;
      isHandled = true;
      const message = raw_message as StreamMessage;

      // The core routing logic: check the first message's type.
      if (message.type === 'stream-tunnel') {
        // This is a tunneled stream; delegate it to the tunneling feature.
        context.routeTunneledStream(channel, message).catch(err => {
          console.error(`[StreamManager] Tunneled stream routing failed for channel ${channel.id}:`, err);
          channel.close().catch(() => { /* ignore */ });
        });
      } else {
        // This is a standard stream; process it with this manager.
        this.processNewStream(channel, message, context);
      }
    };

    // If the channel closes before the first message, we just clean up.
    const onEarlyClose = (reason?: Error) => {
      if (isHandled) return;
      isHandled = true;
      if (reason) {
        console.debug(`[StreamManager] Channel ${channel.id} closed before first message:`, reason.message);
      }
    };

    channel.onceData(onFirstMessage);
    channel.onClose(onEarlyClose);
  }

  /**
   * Processes a new stream that is confirmed to be a standard (non-tunneled) stream.
   * @param channel The stream channel.
   * @param firstMessage The already-read first message from the channel.
   * @param context The processing dependencies.
   */
  private processNewStream(channel: IncomingStreamChannel, firstMessage: StreamMessage, context: MessageProcessingContext): void {
    const { id: channelId } = channel;

    // Immediately handle the first message that was already received.
    this.handleIncomingMessage(channelId, firstMessage, context).catch(err => {
      console.error(`[StreamManager] Error handling first message for channel ${channelId}:`, err);
      this.closeIncoming(channelId, err as Error);
    });

    // Set up listeners for subsequent data and closure events.
    channel.onData(async (raw_message) => {
      try {
        await this.handleIncomingMessage(channelId, raw_message as StreamMessage, context);
      } catch (err) {
        console.error(`[StreamManager] Error handling subsequent message for channel ${channelId}:`, err);
        this.closeIncoming(channelId, err as Error);
      }
    });

    channel.onClose((reason) => this.closeIncoming(channelId, reason));
  }

  /**
   * Closes a specific incoming stream and cleans up its associated buffer.
   * @param channelId The ID of the channel to close.
   * @param error The optional reason for closure.
   */
  public closeIncoming(channelId: ChannelId, error?: Error): void {
    const buffer = this.buffers.get(channelId);
    if (buffer) {
      buffer.destroy(error);
      this.buffers.delete(channelId);
    }
  }

  private getOrCreateHandshake(handshakeId: string): PendingHandshake {
    let handshake = this.pendingHandshakes.get(handshakeId);
    if (!handshake) {
      const buffer = new IncomingBuffer();
      // This promise is intentionally not awaited here. It's stored for later resolution.
      const promise = new Promise<ChannelId>((resolve, reject) => {
        handshake = { buffer, resolve, reject };
        this.pendingHandshakes.set(handshakeId, handshake);
      });
      promise.catch(() => { /* Prevent unhandled promise rejection warnings */ });
    }
    return handshake!;
  }

  /**
   * Handles a single incoming message for a specific stream channel.
   * @param channelId The ID of the channel.
   * @param message The stream message to process.
   * @param context The processing dependencies.
   */
  private async handleIncomingMessage(channelId: ChannelId, message: StreamMessage, context: MessageProcessingContext): Promise<void> {
    let buffer = this.buffers.get(channelId);

    // If this is the first data message, it might complete a pending handshake.
    if (!buffer && message.type === 'stream-data' && message.handshakeId) {
      const handshake = this.getOrCreateHandshake(message.handshakeId);
      buffer = handshake.buffer;
      this.buffers.set(channelId, buffer);
      handshake.resolve(channelId); // Fulfill the promise for the waiting reader.
    }

    if (!buffer) {
      // If no handshake, create a new buffer on the fly.
      if (message.type === 'stream-data') {
        buffer = new IncomingBuffer();
        this.buffers.set(channelId, buffer);
      } else {
        // Received a non-data message for an unknown stream.
        console.warn(`[StreamManager] No buffer for channel ${channelId} and message is not 'stream-data'. Ignoring.`, message);
        return;
      }
    }

    switch (message.type) {
      case 'stream-data':
        const deserializedChunk = context.serializer.deserialize(message.chunk);
        await buffer.push(deserializedChunk);
        break;
      case 'stream-end':
        buffer.finish();
        try {
          await buffer.onDrained();
          await context.sendRawMessage({ type: 'stream-ack', channelId });
        } catch (err) {
          if (!(err instanceof BufferClosedError)) {
            console.error(`[StreamManager] Error during drain/ack for channel ${channelId}:`, err);
          }
        }
        break;
      case 'stream-abort':
        const reason = new Error(`Stream [${channelId}] aborted by remote: ${JSON.stringify(message.reason)}`);
        this.closeIncoming(channelId, reason);
        break;
      case 'stream-tunnel':
        // This should have been handled by the router and not reach here.
        console.warn(`[StreamManager] StreamTunnelMessage should not reach handleIncomingMessage for channel ${channelId}.`);
        break;
    }
  }

  /**
   * Creates a pull-based `ReadableStream` that waits for data from a remote source,
   * linked via a `handshakeId`.
   * @param handshakeId The unique ID to link this reader with an incoming stream.
   * @returns A WHATWG `ReadableStream`.
   */
  public createPullReader(handshakeId: string): ReadableStream<JsonValue> {
    const handshake = this.getOrCreateHandshake(handshakeId);
    const { buffer } = handshake;

    const handshakePromise = new Promise<ChannelId>((resolve, reject) => {
      handshake.resolve = resolve;
      handshake.reject = reject;
    });

    handshakePromise.then(
      () => this.pendingHandshakes.delete(handshakeId),
      (err) => {
        this.pendingHandshakes.delete(handshakeId);
        buffer.destroy(err);
      }
    ).catch(() => { /* ignore */ });

    return new ReadableStream({
      async pull(controller) {
        try {
          const chunk = await buffer.pop();
          controller.enqueue(chunk);
        } catch (err) {
          if (err instanceof BufferClosedError) {
            controller.close();
          } else {
            controller.error(err);
          }
        }
      },
      cancel: (reason) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        handshakePromise.then(channelId => this.closeIncoming(channelId, error)).catch(() => { /* ignore */ });
        buffer.destroy(error);
        this.pendingHandshakes.get(handshakeId)?.reject(error);
        this.pendingHandshakes.delete(handshakeId);
      }
    });
  }
}