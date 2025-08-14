import * as http2 from 'http2';
import { ClientHttp2Session } from 'http2';
import { Http2Transport, ControlChannel, OutgoingStreamChannel, IncomingStreamChannel, MaybePromise } from '@eleplug/h2';

/**
 * Implements the eRPC `Transport` interface over a client-side HTTP/2 session.
 *
 * This class manages the entire lifecycle of the connection, including:
 * - Establishing and caching the primary control channel.
 * - Opening new outgoing stream channels.
 * - Handling server-initiated stream channels via signals.
 * - Managing graceful shutdown (`close`) and immediate termination (`abort`).
 * - Reacting to session-level events like 'error', 'close', and 'goaway'.
 */
declare class Http2ClientTransport implements Http2Transport {
    private readonly session;
    private readonly events;
    private onIncomingStreamHandler;
    private state;
    private controlChannelPromise;
    /** A promise that resolves when the transport is fully closed. */
    private readonly closePromise;
    private resolveClosePromise;
    constructor(session: ClientHttp2Session);
    /**
     * Sets up listeners for critical session events to manage the transport lifecycle.
     * @internal
     */
    private setupSessionListeners;
    /**
     * The single, idempotent entry point for all transport shutdown logic.
     * This ensures cleanup happens exactly once and emits the final 'close' event.
     * @internal
     */
    private performFinalCleanup;
    getControlChannel(): Promise<ControlChannel>;
    openOutgoingStreamChannel(): Promise<OutgoingStreamChannel>;
    onIncomingStreamChannel(handler: (channel: IncomingStreamChannel) => MaybePromise<void>): void;
    onClose(handler: (reason?: Error) => MaybePromise<void>): void;
    close(): Promise<void>;
    abort(reason: Error): Promise<void>;
    /**
     * Processes signals received from the server on the control channel.
     * @internal
     */
    private handleServerSignal;
    /**
     * Handles a server's request to open a new stream channel by creating a new
     * outgoing request that the server can correlate.
     * @internal
     */
    private handleOpenStreamRequest;
}

/**
 * A builder for creating and configuring an eRPC HTTP/2 client transport.
 * This provides a fluent API to specify connection details before connecting.
 */
declare class ClientBuilder {
    private readonly authority;
    private readonly options?;
    /**
     * @param authority The URL of the server to connect to (e.g., 'https://localhost:8080').
     * @param options Optional Node.js `http2.connect` options, for things like
     * custom CAs, client certificates, or other TLS/TCP settings.
     */
    constructor(authority: string, options?: http2.ClientSessionOptions | undefined);
    /**
     * Initiates the connection to the remote server and establishes the transport.
     *
     * @returns A promise that resolves with the fully connected and ready-to-use
     * `Http2Transport` instance, or rejects if the connection fails (e.g., due
     * to network error, TLS handshake failure, or server not listening).
     */
    connect(): Promise<Http2Transport>;
}
/**
 * Creates a new eRPC HTTP/2 client builder. This is the main entry point
 * for creating a client-side transport.
 *
 * @example
 * ```ts
 * import { client } from '@eleplug/h2-client';
 *
 * const transport = await client('https://api.example.com')
 *   .connect();
 *
 * // Now use the transport with your eRPC client...
 * ```
 *
 * @param authority The URL of the server to connect to.
 * @param options Optional Node.js `http2.connect` options.
 * @returns A `ClientBuilder` instance to chain the `connect()` call.
 */
declare function client(authority: string, options?: http2.ClientSessionOptions): ClientBuilder;

export { Http2ClientTransport, client };
