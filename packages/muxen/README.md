# `@eleplug/muxen`

`muxen` is a lightweight, protocol-agnostic multiplexer that provides a reliable, flow-controlled, and full-featured transport layer over any simple, message-based duplex link. It implements the standard `@eleplug/transport` interface, making it a powerful "upgrade" for raw communication channels like WebSockets, WebRTC DataChannels, or IPC.

[![npm version](https://img.shields.io/npm/v/@eleplug/muxen.svg)](https://www.npmjs.com/package/@eleplug/muxen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The Problem It Solves

Many common communication mechanisms, like a single WebSocket connection or a WebRTC DataChannel, provide only a single, raw message pipe. This presents several challenges for building robust applications:

*   **No Multiplexing**: You cannot easily run multiple independent conversations (e.g., an RPC call and a large file transfer) simultaneously without them interfering with each other (head-of-line blocking).
*   **No Reliability**: If a message is dropped, there is no built-in mechanism to detect or retransmit it.
*   **No Guaranteed Ordering**: Messages might arrive out of order.
*   **No Flow Control**: A fast sender can easily overwhelm a slow receiver, causing buffer overflows, high memory usage, and potential connection termination.

`muxen` solves all these problems by implementing a sophisticated multiplexing protocol on top of your existing link.

## Core Features

*   **Channel Multiplexing**: Create multiple, independent, virtual `Channel`s over a single physical link, enabling concurrent, non-blocking communication.
*   **Reliable & Ordered Delivery**: Implements a sequence-and-acknowledgment system to guarantee that all data packets for a given channel are delivered exactly once and in the correct order. Lost packets are automatically retransmitted.
*   **Flow Control**: Utilizes a sliding window protocol to prevent a sender from overwhelming a receiver. The `send()` method provides true backpressure, asynchronously waiting until the receiver is ready for more data.
*   **Liveness Detection**: A built-in heartbeat (`ping`/`pong`) mechanism automatically detects and terminates unresponsive or "zombie" connections.
*   **Standard `Transport` Interface**: Implements the `@eleplug/transport` interface, making it a drop-in component for any library built on that abstraction, such as `@eleplug/erpc`.

## How It Works

`muxen` operates by introducing a thin protocol layer that wraps all application data in `MultiplexedPacket`s. These packets contain a `channelId` and a `sequence` number, allowing `muxen` to perform its core functions:

1.  **The `Link` Abstraction**: You provide a simple `Link` object that wraps your raw communication primitive (e.g., a `WebSocket`). This `Link` is only responsible for sending and receiving raw packets.

2.  **The `Muxer` Engine**: The core component that handles demultiplexing incoming packets, routing them to the correct channel, and managing the heartbeat.

3.  **`Channel`s**: Each channel (`ControlChannel` or `StreamChannel`) has its own `Sender` and `Receiver`.
    *   The `Sender` manages the sending window, retransmission timers, and backpressure.
    *   The `Receiver` manages the receive buffer, acknowledges packets, and re-sequences out-of-order data before delivering it to the application.

This architecture effectively creates a robust, multi-channel `Transport` from a simple, single-channel `Link`.

## Usage

The primary entry point is the `createDuplexTransport` factory function.

### 1. Create a `Link`

First, wrap your underlying connection primitive in an object that conforms to the `Link` interface.

```typescript
// Example: Creating a Link from a WebSocket
import type { Link } from '@eleplug/muxen';
import mimic from '@eleplug/mimic'; // For JSON-like serialization
import { WebSocket } from 'ws';

// Assume 'ws' is a connected WebSocket instance
const wsLink: Link = {
  // Parse incoming data and pass it to the handler
  onMessage: (handler) => {
    ws.on('message', (data) => {
      // It's crucial that the link can handle the serialized packet format.
      // `mimic` or a similar library is recommended for robust JSON handling.
      handler(mimic.parse(data.toString())); 
    });
  },
  // Notify the handler when the connection closes
  onClose: (handler) => {
    ws.on('close', (code, reason) => {
      const error = code === 1000 ? undefined : new Error(reason.toString());
      handler(error);
    });
    ws.on('error', (err) => handler(err));
  },
  // Stringify and send the packet over the WebSocket
  sendMessage: async (packet) => {
    ws.send(mimic.stringify(packet));
  },
  // Implement graceful and abrupt close
  close: async () => ws.close(),
  abort: async (err) => ws.terminate(),
};
```

### 2. Create the `Transport`

Pass your `Link` to the factory function. You can also provide optional configuration.

```typescript
import { createDuplexTransport } from '@eleplug/muxen';
import { createClient, type Api } from '@eleplug/erpc';

const transport = createDuplexTransport(wsLink, {
  // Optional configuration
  heartbeatInterval: 10000, // Send a ping every 10 seconds
  ackTimeout: 5000,         // Resend a packet if not acked within 5 seconds
});
```

### 3. Use with a Higher-Level Library

The `transport` object can now be used with any compatible library, like `@eleplug/erpc`.

```typescript
// Define your API type
type MyApi = Api<any, any>; 

// Create an erpc client using the muxen transport
const client = await createClient<MyApi>(transport);

// Now you can make reliable, multiplexed RPC calls
const result = await client.someProcedure.ask('data');
```

## Provided Implementations

While `muxen` is transport-agnostic, we provide a pre-built in-memory implementation for easy testing:

*   `@eleplug/muxen-mem`: Provides a `MemoryConnector` that creates a pair of linked `Link`s, perfect for creating a client and server transport within the same process.

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).