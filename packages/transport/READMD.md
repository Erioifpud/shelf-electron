# `@eleplug/transport`

This package provides the foundational abstract interface and core types for all transport layers within the eleplug ecosystem. It is a **specification**, not a concrete implementation. Its purpose is to define a common contract that allows higher-level libraries like `@eleplug/erpc` and `@eleplug/ebus` to remain decoupled from the underlying communication mechanism (e.g., WebSockets, HTTP/2, WebRTC, or in-memory links).

[![npm version](https://img.shields.io/npm/v/@eleplug/transport.svg)](https://www.npmjs.com/package/@eleplug/transport)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Architectural Intent

The primary goal of this package is to establish a clear separation of concerns between application-level logic and the raw data transmission layer. By defining a single, unified `Transport` interface, we enable a pluggable architecture for communication backends.

The layers of the stack are designed as follows:

1.  **Application Layer** (e.g., `@eleplug/erpc`, `@eleplug/ebus`):
    *   Handles RPC logic, serialization, API routing, and business logic.
    *   It is written against the abstract `Transport` interface and has no knowledge of the specific protocol being used underneath.

2.  **Abstract Transport Layer** (this package, `@eleplug/transport`):
    *   Defines the contract that all transport implementations must adhere to.
    *   Specifies how to obtain communication channels (`ControlChannel`, `StreamChannel`) and manage the connection lifecycle.

3.  **Concrete Transport Layer** (e.g., `@eleplug/h2`, `@eleplug/muxen`, a future `@eleplug/ws`):
    *   Provides a concrete implementation of the `Transport` interface.
    *   Manages the specifics of a protocol like HTTP/2, WebSockets, or a custom multiplexer, translating its native concepts (e.g., HTTP/2 streams) into the abstract `Channel` interfaces defined here.

This decoupling provides significant benefits, including enhanced testability (using in-memory transports) and the flexibility to swap communication backends without altering application code.

## The `Transport` Interface Contract

Any class implementing the `Transport` interface must adhere to the following conventions:

### Channel Management

*   `getControlChannel(): Promise<ControlChannel>`
    *   **Convention**: This method **MUST** manage and return the same, single `ControlChannel` instance for the entire lifetime of the connection.
    *   **Purpose**: The control channel is a long-lived, bidirectional channel used for exchanging metadata, RPC calls, and other low-volume control messages.

*   `openOutgoingStreamChannel(): Promise<OutgoingStreamChannel>`
    *   **Convention**: This method must create a new, unique, unidirectional channel for sending a stream of data to the remote peer. The transport is responsible for generating and managing the channel's unique ID.
    *   **Purpose**: Stream channels are typically more ephemeral and are used for transferring large payloads or continuous data feeds efficiently.

*   `onIncomingStreamChannel(handler: (channel: IncomingStreamChannel) => void)`
    *   **Convention**: This method registers a handler that is invoked whenever the remote peer initiates a new stream.
    *   **Purpose**: This is the entry point for accepting streams initiated by the other side of the connection.

### Lifecycle Events & Actions

*   `onClose(handler: (reason?: Error) => void)`
    *   **Convention**: Registers a handler for the transport's final lifecycle event. This handler is guaranteed to be called **exactly once**. An `undefined` reason signifies a graceful closure, while an `Error` object signifies an abnormal termination.

*   `close(): Promise<void>`
    *   **Convention**: This action is **idempotent**. It initiates a graceful shutdown of the connection. The returned promise resolves when the close operation has been *initiated*, not when it is complete. The completion is signaled via the `onClose` handler.

*   `abort(reason: Error): Promise<void>`
    *   **Convention**: This action is **idempotent**. It initiates an immediate, forceful termination of the connection due to an error. This should trigger the `onClose` handlers on both peers with the provided `Error` object.

## Channel Interfaces

The `Transport` deals with several types of channels, all of which extend `BaseChannel`.

*   `BaseChannel`: The foundation for all channels, defining the `isClosed` property and the `onClose` and `close` methods.

*   `ControlChannel`: A specialized, bidirectional channel for control messages. It provides `send(message)` and `onMessage(handler)` for general-purpose messaging. This is typically the primary channel for an `erpc` instance.

*   `StreamChannel`: The base for all data stream channels, adding a unique `id` property. They are unidirectional to simplify flow control and reasoning.
    *   `OutgoingStreamChannel`: Allows the application to `send(data)`.
    *   `IncomingStreamChannel`: Allows the application to listen for data via `onData(handler)`.

## Core Data Types

The transport layer operates on a specific set of data types to ensure compatibility and predictability.

*   `JsonValue`: This is the universal type for all data payloads. It represents any value that can be losslessly converted to a JSON string and back.
    *   **Special Convention**: `Uint8Array` is treated as a primitive type within `JsonValue`. This is a deliberate choice to support efficient binary data transfer. Higher-level serialization layers (like `@eleplug/serbin` or `@eleplug/mimic`) are responsible for handling its representation over the wire (e.g., as raw binary or base64). `bigint` is explicitly excluded due to its lack of a standard JSON representation.

*   `MaybePromise<T>`: A utility type (`T | Promise<T>`) used extensively in event handlers. This convention allows handlers to be either synchronous or asynchronous, providing flexibility for implementers and consumers.

## Provided Implementations

The `@eleplug/transport` package itself is abstract. Concrete, usable implementations are provided in separate packages:

*   `@eleplug/transport-mem`: A simple, in-memory transport ideal for testing and in-process communication. It directly links two `Transport` instances without any networking.
*   `@eleplug/h2-client` & `@eleplug/h2-server`: A robust transport implementation over the HTTP/2 protocol, leveraging its native multiplexing capabilities.
*   `@eleplug/muxen`: A protocol-agnostic multiplexer that provides a reliable, flow-controlled `Transport` layer over any simple, message-based link (like a single WebSocket connection).

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).