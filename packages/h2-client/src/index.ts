import * as http2 from 'http2';
import type { Http2Transport } from '@eleplug/h2';
import { Http2ClientTransport } from './transport.js';

/**
 * A builder for creating and configuring an eRPC HTTP/2 client transport.
 * This provides a fluent API to specify connection details before connecting.
 */
class ClientBuilder {
  /**
   * @param authority The URL of the server to connect to (e.g., 'https://localhost:8080').
   * @param options Optional Node.js `http2.connect` options, for things like
   * custom CAs, client certificates, or other TLS/TCP settings.
   */
  constructor(
    private readonly authority: string,
    private readonly options?: http2.ClientSessionOptions,
  ) {}

  /**
   * Initiates the connection to the remote server and establishes the transport.
   *
   * @returns A promise that resolves with the fully connected and ready-to-use
   * `Http2Transport` instance, or rejects if the connection fails (e.g., due
   * to network error, TLS handshake failure, or server not listening).
   */
  public connect(): Promise<Http2Transport> {
    return new Promise((resolve, reject) => {
      const session = http2.connect(this.authority, this.options);

      const onConnect = () => {
        // Successfully connected. Clean up the error listener and resolve.
        session.removeListener('error', onError);
        const transport = new Http2ClientTransport(session);
        resolve(transport);
      };

      const onError = (err: Error) => {
        // Connection failed. Clean up the connect listener and reject.
        session.removeListener('connect', onConnect);
        reject(err);
      };

      // Listen for the two possible outcomes of the connection attempt.
      session.once('connect', onConnect);
      session.once('error', onError);
    });
  }
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
export function client(
  authority: string,
  options?: http2.ClientSessionOptions,
): ClientBuilder {
  return new ClientBuilder(authority, options);
}

export { Http2ClientTransport };