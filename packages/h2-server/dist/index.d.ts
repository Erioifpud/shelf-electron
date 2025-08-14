import * as http2 from 'http2';
import { ServerHttp2Session } from 'http2';
import { Http2Transport, OutgoingStreamChannel, ControlChannel, IncomingStreamChannel, MaybePromise } from '@eleplug/h2';

/**
 * Implements the eRPC `Transport` interface over a server-side HTTP/2 session.
 * An instance of this class is created for each new client connection.
 *
 * This class manages the session's lifecycle, including:
 * - Handling incoming requests and routing them to control or data channels.
 * - Orchestrating the creation of server-initiated stream channels.
 * - Managing graceful shutdown (`close`) and immediate termination (`abort`).
 */
declare class Http2ServerTransport implements Http2Transport {
    private readonly session;
    private readonly events;
    private onIncomingStreamHandler;
    private state;
    private isControlChannelEstablished;
    private readonly controlChannelPromise;
    private resolveControlChannel;
    private rejectControlChannel;
    /**
     * Stores resolvers for pending server-initiated streams, keyed by the
     * `channelId` sent to the client.
     */
    private readonly pendingOutgoingStreams;
    private readonly closePromise;
    private resolveClosePromise;
    constructor(session: ServerHttp2Session);
    /** Sets up listeners for critical session events. @internal */
    private setupSessionListeners;
    /** Single, idempotent entry point for all transport shutdown logic. @internal */
    private performFinalCleanup;
    /** Routes an incoming HTTP/2 stream to the appropriate handler. @internal */
    private handleIncomingStream;
    /** Handles the establishment of the single control channel. @internal */
    private handleControlStream;
    /** Handles an incoming data stream (client- or server-initiated). @internal */
    private handleDataStream;
    openOutgoingStreamChannel(): Promise<OutgoingStreamChannel>;
    getControlChannel(): Promise<ControlChannel>;
    onIncomingStreamChannel(handler: (channel: IncomingStreamChannel) => MaybePromise<void>): void;
    onClose(handler: (reason?: Error) => MaybePromise<void>): void;
    close(): Promise<void>;
    abort(reason: Error): Promise<void>;
}

/**
 * A builder for creating and configuring an eRPC HTTP/2 server.
 * This provides a fluent API to specify server options and start listening.
 */
declare class ServerBuilder {
    private readonly host;
    private readonly port;
    private readonly options?;
    /**
     * @param host The host to bind to (e.g., '0.0.0.0' or 'localhost').
     * @param port The port to listen on.
     * @param options Optional Node.js `http2.createSecureServer` (for TLS) or
     * `http2.createServer` options. The presence of a `key` and `cert` will
     * determine if a secure server is created.
     */
    constructor(host: string, port: number, options?: (http2.SecureServerOptions | http2.ServerOptions) | undefined);
    /**
     * Starts the HTTP/2 server and begins accepting new connections.
     *
     * @param handler A function that will be executed for each new client
     * connection (session). It receives a dedicated `Http2Transport` instance
     * for that specific client. This is where you would attach the transport
     * to an eRPC router or application logic.
     *
     * @returns The underlying Node.js `Http2Server` or `Http2SecureServer` instance.
     */
    accept(handler: (transport: Http2Transport) => void): http2.Http2Server | http2.Http2SecureServer;
}
/**
 * Creates a new eRPC HTTP/2 server builder. This is the main entry point
 * for creating a server-side transport listener.
 *
 * @example
 * ```ts
 * import { server } from '@eleplug/h2-server';
 *
 * server('0.0.0.0', 8080).accept((transport) => {
 *   console.log('New client connected!');
 *   // Attach transport to an eRPC router here
 * });
 * ```
 *
 * @param host The host to bind to.
 * @param port The port to listen on.
 * @param options Optional Node.js server options.
 * @returns A `ServerBuilder` instance to chain the `accept()` call.
 */
declare function server(host: string, port: number, options?: http2.SecureServerOptions | http2.ServerOptions): ServerBuilder;

export { Http2ServerTransport, server };
