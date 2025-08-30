# `@eleplug/h2-server`

This package provides a server-side implementation of the `@eleplug/transport` interface over the HTTP/2 protocol. It is designed to work in tandem with [`@eleplug/h2-client`](#) to create a robust, high-performance, and multiplexed communication layer for `erpc`.

[![npm version](https://img.shields.io/npm/v/@eleplug/h2-server.svg)](https://www.npmjs.com/package/@eleplug/h2-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Core Features

*   **Standard `Transport` Implementation**: Fully implements the `@eleplug/transport` interface, making it a drop-in component for higher-level libraries like `@eleplug/erpc`.
*   **Multi-Client Handling**: Creates a dedicated `Transport` instance for each connected client (`Http2Session`), ensuring complete isolation between clients.
*   **Native Multiplexing**: Leverages the native stream multiplexing capabilities of HTTP/2. Each eRPC `Channel` maps directly to a dedicated HTTP/2 stream.
*   **Bidirectional Streaming**: Supports both client-initiated and server-initiated streams, enabling full-duplex communication patterns.
*   **Efficient Binary Framing**: Uses a simple length-prefixed binary framing protocol integrated with `@eleplug/serbin` for efficient and fast message serialization.

## How It Works

The `h2-server` listens for incoming HTTP/2 connections. For each new client session, it creates a dedicated `Http2ServerTransport` instance that translates HTTP/2 operations into the abstract concepts of the `@eleplug/transport` interface:

*   **Connection**: A new Node.js `http2.ServerHttp2Session` is established for each connecting client. The `accept()` handler receives a `Transport` instance that wraps this session.
*   **Control Channel**: The server listens for an initial `POST` request on the well-known path (`/erpc/control`). Upon receiving it, the server accepts the stream, upgrades it to a `ControlChannel`, and uses it for the lifetime of that client's connection.
*   **Incoming Stream Channels**: The server listens for `POST` requests on `/erpc/stream`. Each such request is accepted and presented to the application as a new `IncomingStreamChannel` via the `transport.onIncomingStreamChannel()` handler.
*   **Outgoing Stream Channels**: To initiate a stream from the server, `transport.openOutgoingStreamChannel()` is called. This sends a special `ServerSignal` message over the control channel, instructing the client to open a new stream. When the client complies and makes the corresponding request, the server correlates it using a unique ID and resolves the `openOutgoingStreamChannel` promise with the newly established channel.

## Installation

⚠️ **Notice:** This project is in early development and has not been published to npm yet.

```bash
npm install @eleplug/h2-server
```

_Note: `@eleplug/h2` contains shared constants and types, and is a peer dependency._

## Usage

The primary entry point is the `server` factory function, which returns a builder to configure and start the server.

```typescript
import { server as createH2Server } from '@eleplug/h2-server';
import { createServer as createErpcServer, initERPC, type Api } from '@eleplug/erpc';
import * as fs from 'fs';
import * as path from 'path';

// 1. Define your erpc API.
const e = initERPC.create();
const appRouter = e.router({
  greet: e.procedure.ask((_env, name: string) => `Hello, ${name}!`),
});
type AppRouter = typeof appRouter;

// 2. Configure and start the HTTP/2 server.
const tlsOptions = {
  key: fs.readFileSync(path.join(__dirname, 'server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'server.crt')),
};

const h2Server = createH2Server('0.0.0.0', 8443, tlsOptions)
  // The 'accept' handler is called for each new client that connects.
  .accept(async (transport) => {
    console.log('New client connected!');

    try {
      // 3. For each client, create a new erpc server instance.
      // This ensures each client gets its own isolated erpc session.
      const erpcServer = await createErpcServer(transport, appRouter);

      // 4. Handle connection closure for this specific client.
      transport.onClose((reason) => {
        if (reason) {
          console.error('Client transport closed with an error:', reason.message);
        } else {
          console.log('Client transport closed gracefully.');
        }
        // The associated erpcServer is automatically closed when the transport closes.
      });

    } catch (error) {
      console.error('Failed to set up erpc server for client:', error);
      // If setup fails, abort the transport.
      await transport.abort(error as Error);
    }
  });

// You can interact with the underlying Node.js server object.
h2Server.on('listening', () => {
  console.log('Server is listening...');
});

// To stop the server:
// h2Server.close();
```

## Configuration

The `server` factory accepts standard Node.js `http2.createServer` or `http2.createSecureServer` options.

*   **Secure Server (HTTPS/TLS)**: To create a secure server, you **must** provide `key` and `cert` properties in the options object. This is the recommended mode for production.

    ```typescript
    import { server as createH2Server } from '@eleplug/h2-server';

    const options = {
      key: fs.readFileSync('path/to/server.key'),
      cert: fs.readFileSync('path/to/server.crt'),
    };
    const secureServer = createH2Server('0.0.0.0', 8443, options).accept(/* ... */);
    ```

*   **Insecure Server (HTTP)**: If no `key` or `cert` are provided, an insecure server is created. This is suitable for development or trusted internal networks.

    ```typescript
    import { server as createH2Server } from '@eleplug/h2-server';

    const insecureServer = createH2Server('localhost', 8080).accept(/* ... */);
    ```

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).