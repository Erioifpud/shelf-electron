# `@eleplug/h2-client`

This package provides a client-side implementation of the `@eleplug/transport` interface over the HTTP/2 protocol. It is designed to work in tandem with [`@eleplug/h2-server`](#) to create a robust, high-performance, and multiplexed communication layer for `erpc`.

[![npm version](https://img.shields.io/npm/v/@eleplug/h2-client.svg)](https://www.npmjs.com/package/@eleplug/h2-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Core Features

*   **Standard `Transport` Implementation**: Fully implements the `@eleplug/transport` interface, making it a drop-in component for higher-level libraries like `@eleplug/erpc`.
*   **Native Multiplexing**: Leverages the native stream multiplexing capabilities of HTTP/2. Each eRPC `Channel` (`ControlChannel` or `StreamChannel`) maps directly to a dedicated HTTP/2 stream, eliminating head-of-line blocking.
*   **Bidirectional Streaming**: Supports both client-initiated and server-initiated streams, enabling full-duplex communication patterns.
*   **Efficient Binary Framing**: Uses a simple length-prefixed binary framing protocol on top of HTTP/2 DATA frames for efficient message passing, integrated with `@eleplug/serbin` for serialization.
*   **Graceful Shutdown**: Properly handles HTTP/2 `GOAWAY` frames for graceful connection termination.

## How It Works

The `h2-client` translates the abstract concepts of the `@eleplug/transport` interface into concrete HTTP/2 operations:

*   **Connection**: A single TCP connection is established and managed as a Node.js `http2.ClientHttp2Session`.
*   **Control Channel**: The first time `getControlChannel()` is called, the client makes a `POST` request to a well-known path (`/erpc/control`). This HTTP/2 stream is kept open for the lifetime of the connection and serves as the primary channel for RPC and signaling.
*   **Outgoing Stream Channels**: When `openOutgoingStreamChannel()` is called, the client makes a new `POST` request to `/erpc/stream`. The resulting HTTP/2 stream becomes the new `OutgoingStreamChannel`.
*   **Incoming Stream Channels**: The server cannot directly open a stream to the client. Instead, it sends a special `ServerSignal` message over the control channel. Upon receiving this signal, the `h2-client` transport automatically initiates a new `POST` request to `/erpc/stream`, including a special header (`x-erpc-channel-id`) that allows the server to correlate this new stream with its original request. This stream is then presented to the application as an `IncomingStreamChannel`.

## Installation

⚠️ **Notice:** This project is in early development and has not been published to npm yet.

```bash
npm install @eleplug/h2-client
```

_Note: `@eleplug/h2` contains shared constants and types, and is a peer dependency._

## Usage

The primary entry point is the `client` factory function, which returns a builder to establish a connection.

```typescript
import { client as createH2Client } from '@eleplug/h2-client';
import { createClient as createErpcClient, type Api } from '@eleplug/erpc';
import * as fs from 'fs';

// Define the shape of the API you expect the server to provide.
type MyServerApi = Api</*...*/>;

async function main() {
  try {
    // 1. Use the builder to configure and establish the transport connection.
    // For a secure (HTTPS) connection, provide TLS options.
    const transport = await createH2Client('https://localhost:8443', {
      ca: fs.readFileSync('path/to/ca.crt'), // Trust the server's certificate
    }).connect();

    console.log('H2 Transport connected successfully!');

    // The transport can also connect to an insecure (HTTP) server.
    // const insecureTransport = await createH2Client('http://localhost:8080').connect();

    // 2. Once the transport is connected, use it to create your erpc client.
    const erpcClient = await createErpcClient<MyServerApi>(transport);

    // 3. You can now make type-safe RPC calls.
    const response = await erpcClient.someProcedure.ask('World');
    console.log('Server responded:', response);

    // 4. The transport will automatically handle connection closure.
    transport.onClose((reason) => {
      if (reason) {
        console.error('Transport closed due to an error:', reason.message);
      } else {
        console.log('Transport closed gracefully.');
      }
    });

  } catch (error) {
    console.error('Failed to connect or an RPC call failed:', error);
  }
}

main();
```

## Configuration

The `client` factory accepts a second optional argument for `http2.ClientSessionOptions`, which allows for advanced configuration of the underlying Node.js HTTP/2 session. This can be used for:

*   Client certificate authentication (`key`, `cert`).
*   Specifying custom TLS/SSL settings.
*   Adjusting socket and TCP options.

```typescript
import { client as createH2Client } from '@eleplug/h2-client';

const transport = await createH2Client('https://api.internal', {
  key: fs.readFileSync('path/to/client.key'),
  cert: fs.readFileSync('path/to/client.crt'),
  ca: fs.readFileSync('path/to/ca.crt'),
}).connect();
```

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).