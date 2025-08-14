import { JsonValue, MaybePromise, Transport, ControlChannel, OutgoingStreamChannel, IncomingStreamChannel } from '@eleplug/transport';

/**
 * Configuration options for the DuplexTransport.
 */
interface DuplexTransportOptions {
    /**
     * The interval in milliseconds for sending heartbeat pings to check for
     * connection liveness.
     * @default 5000
     */
    heartbeatInterval?: number;
    /**
     * The timeout in milliseconds to wait for a `pong` response after sending
     * a `ping`. If a pong is not received, the connection is considered dead.
     * @default 10000
     */
    heartbeatTimeout?: number;
    /**
     * The timeout in milliseconds for retransmitting an unacknowledged data packet.
     * This determines how long the sender waits for an `ack` before assuming a
     * packet was lost.
     * @default 2000
     */
    ackTimeout?: number;
    /**
     * The maximum number of unacknowledged packets that can be in flight at any
     * given time. This defines the size of the sender's sliding window and is
     * the primary mechanism for flow control.
     * @default 64
     */
    sendWindowSize?: number;
    /**
     * The maximum number of out-of-order packets that can be buffered on the
     * receiving end. This defines the size of the receiver's buffer for
     * re-sequencing incoming packets.
     * @default 128
     */
    receiveBufferSize?: number;
}

/** A unique identifier for a multiplexed channel within a transport. */
type MuxenChannelId = string;
/**
 * A constant identifier for the special control channel, used for all
 * non-stream-related RPC communication.
 */
declare const CONTROL_CHANNEL_ID: MuxenChannelId;
/**
 * The sender window size for a stream channel before its handshake is acknowledged.
 * This allows a small amount of data to be sent speculatively along with the
 * `open-stream` request to reduce round-trip latency.
 */
declare const PRE_HANDSHAKE_WINDOW_SIZE = 8;
/** A base interface for packets that belong to a specific channel. */
interface BaseChannelPacket {
    type: string;
    channelId: MuxenChannelId;
}
/** A packet containing an application data payload. */
interface DataPacket extends BaseChannelPacket {
    type: 'data';
    /** A sequence number for ordering and acknowledgment. */
    seq: number;
    /**
     * The application-level payload. Its structure is opaque to the muxen layer,
     * allowing for generic data transport.
     */
    payload: JsonValue;
}
/** A packet sent to acknowledge the receipt of a `DataPacket`. */
interface AckPacket extends BaseChannelPacket {
    type: 'ack';
    /** The sequence number of the `DataPacket` being acknowledged. */
    ackSeq: number;
}
/** A packet sent to request the opening of a new stream channel. */
interface OpenStreamPacket extends BaseChannelPacket {
    type: 'open-stream';
}
/** A packet sent to acknowledge the opening of a new stream channel. */
interface OpenStreamAckPacket extends BaseChannelPacket {
    type: 'open-stream-ack';
}
/** A packet sent to gracefully close a specific channel. */
interface CloseChannelPacket extends BaseChannelPacket {
    type: 'close-channel';
    /** An optional, serializable reason for the closure. */
    reason?: JsonValue;
}
/** A heartbeat packet sent to check for connection liveness. */
interface HeartbeatPingPacket {
    type: 'ping';
}
/** A heartbeat packet sent in response to a `ping`. */
interface HeartbeatPongPacket {
    type: 'pong';
}
/** A union of all packet types that are associated with a channel. */
type ChannelPacket = DataPacket | AckPacket | OpenStreamPacket | OpenStreamAckPacket | CloseChannelPacket;
/** A union of all link-level heartbeat packets. */
type HeartbeatPacket = HeartbeatPingPacket | HeartbeatPongPacket;
/** A union of all possible packet types in the muxen protocol. */
type MultiplexedPacket = ChannelPacket | HeartbeatPacket;
/** Type guard to check if a value is a `ChannelPacket`. */
declare function isChannelPacket(value: any): value is ChannelPacket;
/** Type guard to check if a value is a `HeartbeatPacket`. */
declare function isHeartbeatPacket(value: any): value is HeartbeatPacket;
/** Type guard to check if a value is a valid `MultiplexedPacket`. */
declare function isMultiplexedPacket(value: any): value is MultiplexedPacket;

/**
 * Describes an abstract, full-duplex communication link.
 *
 * This interface serves as the foundation for the `DuplexTransport`, allowing it
 * to operate over various underlying mechanisms (e.g., WebSockets, WebRTC, IPC)
 * so long as they conform to this contract. The link is responsible for sending
 * and receiving raw `MultiplexedPacket` objects.
 */
interface Link {
    /**
     * Registers a handler that is invoked when a message is received from the
     * remote peer. The transport will provide one handler for the lifetime of the link.
     * @param handler The function to process the incoming message.
     */
    onMessage(handler: (message: MultiplexedPacket) => MaybePromise<void>): void;
    /**
     * Sends a message over the link.
     * @param message The multiplexed packet to send.
     * @returns A promise that resolves when the message has been successfully
     * queued for sending by the underlying mechanism.
     */
    sendMessage(message: MultiplexedPacket): Promise<void>;
    /**
     * Registers a handler for when the link is closed for any reason.
     * The transport will provide one handler for the lifetime of the link.
     * @param handler The function to handle the close event, which may receive
     * an `Error` object if the closure was abnormal.
     */
    onClose(handler: (reason?: Error) => MaybePromise<void>): void;
    /**
     * Aborts the link immediately. This should trigger the `onClose` handler
     * with the provided reason.
     * @param reason An `Error` object explaining the reason for the abort.
     * @returns A promise that resolves when the abort operation is initiated.
     */
    abort(reason: Error): Promise<void>;
    /**
     * Closes the link gracefully. This should eventually trigger the `onClose`
     * handler with an `undefined` reason.
     * @returns A promise that resolves when the close operation is initiated.
     */
    close(): Promise<void>;
}

/**
 * A full-featured, multiplexed transport implementation built on top of a
 * simple, message-based `Link`. It provides reliable, ordered, and flow-
 * controlled channels for both control messages and data streams, conforming
 * to the standard `@eleplug/transport` `Transport` interface.
 */
declare class DuplexTransport implements Transport {
    private readonly events;
    private readonly muxer;
    private readonly options;
    private readonly channels;
    private _onIncomingStreamChannelHandler;
    private _isClosed;
    private controlChannel;
    constructor(link: Link, options?: DuplexTransportOptions);
    /**
     * Binds the transport's packet and lifecycle handlers to the Muxer.
     * @internal
     */
    private bindMuxerListeners;
    /**
     * The main packet router for the transport. It receives all channel-related
     * packets from the Muxer and routes them to the correct channel instance
     * or handles channel lifecycle packets.
     * @internal
     */
    private handlePacket;
    /**
     * Creates and registers a new incoming stream channel upon request from a peer.
     * @internal
     */
    private _createIncomingStream;
    /**
     * The final, idempotent cleanup logic for the entire transport. This is
     * triggered when the underlying link closes.
     * @internal
     */
    private finalCleanup;
    /**
     * Lazily creates the singleton control channel on first access.
     * @internal
     */
    private _getOrCreateControlChannel;
    getControlChannel(): Promise<ControlChannel>;
    openOutgoingStreamChannel(): Promise<OutgoingStreamChannel>;
    onIncomingStreamChannel(handler: (channel: IncomingStreamChannel) => MaybePromise<void>): void;
    onClose(handler: (reason?: Error) => MaybePromise<void>): void;
    close(): Promise<void>;
    abort(reason: Error): Promise<void>;
}

/**
 * Creates a new multiplexed `Transport` layer over a simple duplex `Link`.
 *
 * This factory function is the primary public entry point for the `@eleplug/muxen`
 * library. It takes a simple, message-based communication link (like a
 * WebSocket, a WebRTC DataChannel, or an IPC channel) and wraps it with a
 * full-featured transport implementation. The returned transport provides
 * multiplexed channels, reliability (ordering and retransmission), and flow
 * control, making it fully compatible with the `@eleplug/transport` interface.
 *
 * @example
 * ```ts
 * import { createDuplexTransport, type Link } from '@eleplug/muxen';
 * import { someRpcClient } from '@eleplug/erpc';
 * import { WebSocket } from 'ws';
 *
 * // 1. Create a Link object that wraps a raw connection (e.g., a WebSocket).
 * const ws = new WebSocket('ws://localhost:8080');
 * const myLink: Link = {
 *   onMessage: (handler) => ws.on('message', (data) => handler(mimic.parse(data.toString()))),
 *   onClose: (handler) => ws.on('close', () => handler()),
 *   sendMessage: async (packet) => ws.send(mimic.stringify(packet)),
 *   close: async () => ws.close(),
 *   abort: async (err) => ws.terminate(),
 * };
 *
 * // 2. Create the transport instance using the link.
 * const transport = createDuplexTransport(myLink);
 *
 * // 3. Use the transport with a higher-level client.
 * const client = someRpcClient.createClient({ transport });
 *
 * async function main() {
 *   const result = await client.greet.query('World');
 *   console.log(result); // "Hello, World!"
 *   await transport.close();
 * }
 * ```
 *
 * @param link An object conforming to the `Link` interface, representing the
 * underlying raw duplex communication channel.
 * @param options Optional configuration for timeouts, buffer sizes, and flow
 * control.
 * @returns A `Transport` instance ready to be used.
 */
declare function createDuplexTransport(link: Link, options?: DuplexTransportOptions): Transport;

export { type AckPacket, CONTROL_CHANNEL_ID, type ChannelPacket, type CloseChannelPacket, type DataPacket, DuplexTransport, type DuplexTransportOptions, type HeartbeatPacket, type HeartbeatPingPacket, type HeartbeatPongPacket, type Link, type MultiplexedPacket, type MuxenChannelId, type OpenStreamAckPacket, type OpenStreamPacket, PRE_HANDSHAKE_WINDOW_SIZE, createDuplexTransport, isChannelPacket, isHeartbeatPacket, isMultiplexedPacket };
