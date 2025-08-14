import { AsyncEventEmitter, type JsonValue } from '@eleplug/transport';
import type { Feature } from '../../runtime/framework/feature';
import type { TransportAdapterContribution } from '../transport/transport.adapter.feature';
import type {
  ControlMessage,
  NotifyMessage,
  ReleaseMessage,
  RpcRequestMessage,
  RpcResponseMessage,
  StreamAckMessage,
  TunnelMessage,
} from '../../types/protocol.js';

/**
 * Defines the high-level semantic events emitted by the `ProtocolHandlerFeature`.
 * These events represent specific application-level actions within the erpc protocol.
 */
export type SemanticEvents = {
  /** Emitted for an 'ask' (request-response) RPC call. */
  ask: (message: RpcRequestMessage) => void;
  /** Emitted for a 'tell' (fire-and-forget) notification. */
  tell: (message: NotifyMessage) => void;
  /** Emitted for an RPC call targeting a pinned resource. */
  pinCall: (message: RpcRequestMessage) => void;
  /** Emitted when an RPC response is received. */
  response: (message: RpcResponseMessage) => void;
  /** Emitted when a request to release a pinned resource is received. */
  release: (message: ReleaseMessage) => void;
  /** Emitted when a stream is fully acknowledged by the consumer. */
  streamAck: (message: StreamAckMessage) => void;
  /** Emitted when a message for a tunneled transport is received. */
  tunnel: (message: TunnelMessage) => void;
};

/**
 * The capabilities contributed by the `ProtocolHandlerFeature`.
 */
export interface ProtocolHandlerContribution {
  /** An event emitter for high-level, protocol-specific semantic events. */
  semanticEmitter: AsyncEventEmitter<SemanticEvents>;
}

type ProtocolHandlerRequires = TransportAdapterContribution;

/**
 * A feature that processes raw control messages from the transport layer and
 * dispatches them as strongly-typed, high-level semantic events.
 *
 * This feature acts as the primary protocol parser and dispatcher, allowing
 * other features to listen for specific actions (like 'ask' or 'response')
 * without needing to know the low-level message structure.
 */
export class ProtocolHandlerFeature implements Feature<ProtocolHandlerContribution, ProtocolHandlerRequires> {
  private readonly semanticEmitter = new AsyncEventEmitter<SemanticEvents>();

  public contribute(): ProtocolHandlerContribution {
    return {
      semanticEmitter: this.semanticEmitter,
    };
  }

  public init(capability: ProtocolHandlerRequires): void {
    // Listen for raw messages from the transport adapter.
    capability.rawEmitter.on('message', (message: JsonValue) => {
      this.processMessage(message);
    });
  }

  /**
   * Parses a raw `JsonValue`, validates it as a `ControlMessage`, and emits
   * a corresponding semantic event based on its `type` and `kind`.
   * @param message The raw, un-parsed `JsonValue` from the transport.
   */
  private processMessage(message: JsonValue): void {
    if (typeof message !== 'object' || message === null || !('type' in message) || typeof message.type !== 'string') {
      console.error(`[erpc protocol] Received malformed message without a 'type' property:`, message);
      return;
    }

    try {
      const typedMessage = message as ControlMessage;

      // This switch statement is the core of the protocol dispatch logic.
      switch (typedMessage.type) {
        case 'rpc-request':
          // Further dispatch based on the 'kind' of RPC call.
          if (typedMessage.kind === 'pin') {
            this.semanticEmitter.emit('pinCall', typedMessage);
          } else {
            this.semanticEmitter.emit('ask', typedMessage);
          }
          break;
        case 'rpc-response':
          this.semanticEmitter.emit('response', typedMessage);
          break;
        case 'notify':
          this.semanticEmitter.emit('tell', typedMessage);
          break;
        case 'release':
          this.semanticEmitter.emit('release', typedMessage);
          break;
        case 'stream-ack':
          this.semanticEmitter.emit('streamAck', typedMessage);
          break;
        case 'tunnel':
          this.semanticEmitter.emit('tunnel', typedMessage);
          break;
        // No default case needed, as unknown types are safely ignored.
      }
    } catch (error) {
      console.error(`[erpc protocol] Error processing message:`, error, message);
    }
  }

  public close(contribution: ProtocolHandlerContribution): void {
    contribution.semanticEmitter.removeAllListeners();
  }
}