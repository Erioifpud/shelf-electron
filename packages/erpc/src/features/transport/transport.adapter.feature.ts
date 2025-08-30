import type {
  Transport,
  OutgoingStreamChannel,
  IncomingStreamChannel,
  ControlChannel,
  JsonValue,
} from "@eleplug/transport";
import { AsyncEventEmitter } from "@eleplug/transport";
import type { Feature } from "../../runtime/framework/feature";
import type { ControlMessage } from "../../types/protocol";

/**
 * Defines the raw events emitted by the `TransportAdapterFeature`.
 * These events are a direct, un-interpreted feed from the underlying transport layer.
 */
export type RawTransportEvents = {
  /** Emitted when a raw message is received on the control channel. */
  message: (message: ControlMessage) => void;
  /** Emitted when the remote peer opens a new incoming stream channel. */
  incomingStreamChannel: (channel: IncomingStreamChannel) => void;
  /** Emitted exactly once when the transport connection is closed, for any reason. */
  close: (error?: Error) => void;
};

/**
 * The capabilities contributed by the `TransportAdapterFeature`.
 * It provides a standardized interface to the underlying transport layer.
 */
export interface TransportAdapterContribution {
  /** An event emitter for raw transport-level events. */
  readonly rawEmitter: AsyncEventEmitter<RawTransportEvents>;
  /** Sends a raw control message over the transport. */
  sendRawMessage: (message: ControlMessage) => Promise<void>;
  /** Opens a new outgoing stream channel on the transport. */
  openOutgoingStreamChannel: () => Promise<OutgoingStreamChannel>;
}

/**
 * A feature that adapts a generic `Transport` implementation for use by the erpc runtime.
 *
 * This feature is the bridge between the abstract transport layer (e.g., WebSockets,
 * WebRTC) and the rest of the erpc system. It normalizes events and actions into a
 * consistent, high-level API for other features to consume.
 */
export class TransportAdapterFeature
  implements Feature<TransportAdapterContribution, {}>
{
  private readonly transport: Transport;
  private readonly rawEmitter = new AsyncEventEmitter<RawTransportEvents>();
  private controlChannel?: ControlChannel;
  private closing: boolean = false;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  public contribute(): TransportAdapterContribution {
    return {
      rawEmitter: this.rawEmitter,
      sendRawMessage: this.sendRawMessage.bind(this),
      openOutgoingStreamChannel: this.openOutgoingStreamChannel.bind(this),
    };
  }

  public async init(_capability: any): Promise<void> {
    this.controlChannel = await this.transport.getControlChannel();

    // Listen for incoming messages on the control channel and emit them raw.
    this.controlChannel.onMessage((message: JsonValue) => {
      this.rawEmitter.emit("message", message as ControlMessage);
    });

    // Listen for new incoming stream channels and emit them raw.
    this.transport.onIncomingStreamChannel((channel) => {
      this.rawEmitter.emit("incomingStreamChannel", channel);
    });

    // Listen for the transport's closure event.
    this.transport.onClose((reason) => {
      this.handleClose(reason);
    });
  }

  /**
   * Handles the transport closure event, ensuring it's processed only once.
   * This prevents race conditions if multiple close signals are received.
   * @param reason The optional error that caused the closure.
   */
  private handleClose(reason?: Error) {
    if (this.closing) return;
    this.closing = true;
    this.rawEmitter.emit("close", reason);
  }

  private async sendRawMessage(message: ControlMessage): Promise<void> {
    if (this.closing) {
      throw new Error("Transport is closing; cannot send message.");
    }
    if (!this.controlChannel) {
      throw new Error("Transport not ready, control channel is not available.");
    }
    await this.controlChannel.send(message);
  }

  private async openOutgoingStreamChannel(): Promise<OutgoingStreamChannel> {
    if (this.closing) {
      throw new Error(
        "Transport is closing; cannot open a new stream channel."
      );
    }
    return this.transport.openOutgoingStreamChannel();
  }

  public close(
    _contribution: TransportAdapterContribution,
    error?: Error
  ): void {
    // Propagate the close signal internally.
    this.handleClose(error);
    this.rawEmitter.removeAllListeners();
    // Attempt to gracefully close the underlying transport.
    this.transport.close().catch(() => {
      /* Ignore errors on close */
    });
  }
}
