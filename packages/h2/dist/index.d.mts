import { Transform, TransformCallback } from 'stream';
import { ClientHttp2Stream, ServerHttp2Stream } from 'http2';
import { AsyncEventEmitter, MaybePromise, Transport } from '@eleplug/transport';
export { AsyncEventEmitter, BaseChannel, ChannelId, ControlChannel, IncomingStreamChannel, JsonValue, MaybePromise, OutgoingStreamChannel, StreamChannel } from '@eleplug/transport';

/**
 * Defines shared constants for the HTTP/2 transport implementation.
 * These values form the contract between the H2 client and server.
 */
/**
 * The HTTP/2 path (`:path` pseudo-header) used for establishing the primary
 * eRPC control channel. This channel handles all non-stream RPCs and
 * transport-level signaling.
 */
declare const CONTROL_PATH = "/erpc/control";
/**
 * The HTTP/2 path (`:path` pseudo-header) used for establishing eRPC stream
 * channels. Both client-initiated and server-initiated streams use this path.
 */
declare const STREAM_PATH = "/erpc/stream";
/**
 * The HTTP header used by the client to identify a stream request that was
 * initiated by a server signal.
 *
 * @remarks
 * When the server needs to open a stream, it sends a signal over the control
 * channel containing a new `channelId`. The client then makes a new HTTP/2
 * request to `STREAM_PATH` and includes this header with the `channelId` to
 * allow the server to correlate the incoming request with its original signal.
 */
declare const INITIATING_CHANNEL_ID_HEADER = "x-erpc-channel-id";

/**
 * A Transform stream that consumes raw bytes and produces full, length-prefixed frames.
 *
 * This class implements the core protocol parsing logic in an idiomatic Node.js
 * fashion. It is designed to be piped from a raw byte stream (like an Http2Stream)
 * and will, in turn, emit fully assembled data frames as distinct 'data' events.
 *
 * @remarks
 * The primary advantage of using a `Transform` stream is its built-in, automatic
 * handling of backpressure. If the downstream consumer of this parser is slow,
 * this stream's internal readable buffer will fill. When full, `this.push()`
 * will return `false`, and the stream machinery automatically stops consuming
 * data from the upstream source (the `Http2Stream`) until the buffer has drained.
 * This prevents memory leaks and deadlocks in high-throughput scenarios.
 */
declare class FrameParser extends Transform {
    private buffer;
    private expectedFrameSize;
    constructor();
    /**
     * The internal implementation of the transform logic, called by the stream
     * runtime whenever a new chunk of data is available from the upstream source.
     * @param chunk A chunk of raw data from the source stream.
     * @param _encoding The encoding of the chunk (ignored, we work with Buffers).
     * @param callback A function to be called when processing of the current
     * chunk is complete. This signals readiness for the next chunk.
     */
    _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void;
    /**
     * Called by the stream runtime when the upstream source has ended.
     * This method ensures that the stream ends in a clean state.
     * @param callback A function to call when flushing is complete.
     */
    _flush(callback: TransformCallback): void;
}

/**
 * A special message sent from the server to the client over the control channel
 * to signal that the client must initiate a new stream. This is how the server
 * "pushes" a new channel to the client.
 */
type ServerSignal = {
    /** Internal marker to identify the object type. */
    readonly _h2_signal_: true;
    /** The type of signal being sent. */
    readonly type: 'open-stream-request';
    /** The unique ID for the channel that the client should open. */
    readonly channelId: string;
};
/**
 * Type guard to check if a received message is a `ServerSignal`.
 * @param data The data to check.
 * @returns `true` if the data is a valid `ServerSignal`, otherwise `false`.
 */
declare function isServerSignal(data: unknown): data is ServerSignal;
type H2Stream = ClientHttp2Stream | ServerHttp2Stream;
/**
 * An abstract base class for all eRPC-over-HTTP/2 channel implementations.
 *
 * It encapsulates common logic for managing the lifecycle of an underlying
 * Node.js `Http2Stream`. Its responsibilities include:
 * - Unifying 'close' and 'error' events from the stream and its parser.
 * - Providing a promise-based `sendFrame` method with backpressure support.
 * - Exposing standard `onClose` and `close` methods.
 *
 * @template StreamType The specific type of the underlying `Http2Stream`.
 */
declare abstract class H2ChannelBase<StreamType extends H2Stream> {
    protected readonly stream: StreamType;
    protected readonly parser: FrameParser;
    protected readonly events: AsyncEventEmitter<{
        close: (reason?: Error) => void;
    }>;
    /** Indicates whether the channel has been closed. */
    get isClosed(): boolean;
    private _isClosed;
    /**
     * @param stream The underlying Node.js HTTP/2 stream.
     * @param parser The `FrameParser` instance that will consume data from the stream.
     */
    constructor(stream: StreamType, parser: FrameParser);
    /**
     * Central, idempotent handler for stream closure. This ensures that cleanup
     * logic runs exactly once, regardless of which event triggered it.
     * @internal
     */
    private handleStreamClose;
    onClose(handler: (reason?: Error) => MaybePromise<void>): void;
    close(): Promise<void>;
    /**
     * Sends a payload as a single length-prefixed frame. This method correctly
     * handles stream backpressure.
     * @param payload The raw data to send in the frame.
     * @returns A promise that resolves when the data has been successfully
     * written or buffered, or rejects on error.
     */
    protected sendFrame(payload: Buffer): Promise<void>;
}

/**
 * A marker interface for an eRPC transport layer implemented over HTTP/2.
 *
 * This interface extends the base `Transport` but does not add new methods.
 * It serves as a type constraint, ensuring that HTTP/2-specific implementations
 * can be correctly identified and used by H2-aware builders and servers.
 *
 * An `Http2Transport` implementation is expected to manage the lifecycle of an
 * `Http2Session` and create `Channel`s over individual `Http2Stream` instances.
 */
interface Http2Transport extends Transport {
}

export { CONTROL_PATH, FrameParser, H2ChannelBase, type Http2Transport, INITIATING_CHANNEL_ID_HEADER, STREAM_PATH, type ServerSignal, isServerSignal };
