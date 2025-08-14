import type { Transport } from '@eleplug/transport';
import { DuplexTransport } from './transport.js';
import type { DuplexTransportOptions } from './types.js';
import type { Link } from './link.js';

export { DuplexTransport, type Link, type DuplexTransportOptions };
export * from './protocol.js';

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
export function createDuplexTransport(
  link: Link,
  options?: DuplexTransportOptions,
): Transport {
  return new DuplexTransport(link, options);
}