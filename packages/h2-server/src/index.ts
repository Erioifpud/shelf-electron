import * as http2 from 'http2';
import type { Http2Transport } from '@eleplug/h2';
import { Http2ServerTransport } from './transport.js';

/**
 * A builder for creating and configuring an eRPC HTTP/2 server.
 * This provides a fluent API to specify server options and start listening.
 */
class ServerBuilder {
  /**
   * @param host The host to bind to (e.g., '0.0.0.0' or 'localhost').
   * @param port The port to listen on.
   * @param options Optional Node.js `http2.createSecureServer` (for TLS) or
   * `http2.createServer` options. The presence of a `key` and `cert` will
   * determine if a secure server is created.
   */
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly options?: http2.SecureServerOptions | http2.ServerOptions,
  ) {}

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
  public accept(
    handler: (transport: Http2Transport) => void,
  ): http2.Http2Server | http2.Http2SecureServer {
    const isSecure = this.options && 'key' in this.options && 'cert' in this.options;
    const server = isSecure
      ? http2.createSecureServer(this.options)
      : http2.createServer();

    server.on('error', (err) =>
      console.error('[H2-Server] Global Server Error:', err),
    );

    // The 'session' event fires for each new connected client.
    server.on('session', (session) => {
      // Create a new transport instance to manage this specific session.
      const transport = new Http2ServerTransport(session);

      // Pass the new transport to the user-provided application handler.
      try {
        handler(transport);
      } catch (err) {
        console.error('[H2-Server] Error in user accept handler:', err);
        // If the user's setup code fails, terminate the session to prevent leaks.
        if (!session.destroyed) {
          session.destroy();
        }
      }
    });

    server.listen(this.port, this.host, () => {
      console.log(
        `[H2-Server] Listening on ${isSecure ? 'https' : 'http'}://${this.host}:${this.port}`,
      );
    });

    return server;
  }
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
export function server(
  host: string,
  port: number,
  options?: http2.SecureServerOptions | http2.ServerOptions,
): ServerBuilder {
  return new ServerBuilder(host, port, options);
}

export { Http2ServerTransport };