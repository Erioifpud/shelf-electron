# `@eleplug/erpc`

A modern, feature-rich, and end-to-end type-safe RPC framework for TypeScript. `erpc` is designed to provide a superior developer experience and robust communication layer for complex applications.

[![npm version](https://img.shields.io/npm/v/@eleplug/erpc.svg)](https://www.npmjs.com/package/@eleplug/erpc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Core Features ✨

*   **🚀 End-to-end Type-Safety**: Define your API once on the server, and the client-side types are automatically inferred. API changes on the server result in compile-time errors on the client, eliminating a whole class of runtime bugs.
*   **🔌 Transport-Agnostic**: `erpc`'s core is decoupled from the underlying transport layer. It can run over WebSockets, WebRTC, MessagePorts, or any custom transport that implements its abstract interface.
*   **🧅 Extensible Middleware System**: Implement cross-cutting concerns like authentication, logging, input validation, and performance monitoring with an elegant "onion-style" middleware system.
*   **🎁 Rich Data Type Support**: Go beyond plain JSON. `erpc` has built-in, extensible support for complex types like **WHATWG Streams** (`ReadableStream`/`WritableStream`), `Uint8Array`, and `Error` objects, enabling more powerful and natural API designs.
*   **📌 Object Pinning**: A powerful feature that allows you to pass server-side objects and functions **by reference** instead of by value. Client-side interactions with a proxy object are automatically forwarded and executed on the original object on the server.
*   **🚇 Transport Tunneling**: An advanced capability that allows tunneling a full `Transport` instance over an existing `erpc` connection, enabling the creation of complex network topologies like proxies and gateways.
*   **💎 Modern API Design**: Built with `Proxy` and `async/await` to provide a clean, intuitive, and modern developer experience.

## Installation

⚠️ **Notice:** This project is in early development and has not been published to npm yet.

```bash
npm install @eleplug/erpc
````

You will also need a specific transport implementation. For testing and in-process communication, you can use `@eleplug/transport-mem`:

```bash
npm install @eleplug/transport-mem
```

## Quick Start

Let's illustrate the core functionality of `erpc` with a basic example.

### 1. Define Your API

Use `initERPC` to create the building blocks for your API definition. An API consists of one or more `procedure`s, organized by a `router`.

```typescript
// api-definition.ts
import { initERPC } from '@eleplug/erpc';

// 1. Create an erpc instance.
export const e = initERPC.create();

// 2. Use a router to organize your procedures.
export const appRouter = e.router({
  // A simple 'ask' (request-response) procedure.
  greeting: e.procedure.ask(
    (env, name: string) => `Hello, ${name}!`
  ),

  // A nested router for organization.
  math: e.router({
    add: e.procedure.ask((_env, a: number, b: number) => a + b),
    // A 'tell' (fire-and-forget) procedure with no return value.
    logToServer: e.procedure.tell((_env, message: string) => {
      console.log(`LOG: ${message}`);
    }),
  }),
});

// 3. Export the type of the API router. This is the key to type-safety!
export type AppRouter = typeof appRouter;
```

### 2. Create the Server and Client

`erpc` connections are peer-to-peer. For this example, we'll create a "server" that provides the API and a "client" that consumes it, connected by an in-memory transport.

```typescript
// main.ts
import { createServer, createClient } from '@eleplug/erpc';
import { MemoryConnector } from '@eleplug/transport-mem';
import { appRouter, type AppRouter } from './api-definition.ts';

async function main() {
  // 1. Create a connector, which provides two linked transports.
  const { client: clientTransport, server: serverTransport } = new MemoryConnector();

  // 2. Create the server, passing the transport and the API implementation.
  const server = await createServer(serverTransport, appRouter);
  console.log('Server is ready.');

  // 3. Create the client, passing its transport and the server's API type.
  const client = await createClient<AppRouter>(clientTransport);
  console.log('Client is ready.');

  // 4. Start making calls! Notice the fully-typed experience.
  const greeting = await client.greeting.ask('erpc');
  console.log('Greeting from server:', greeting); // > Greeting from server: Hello, erpc!

  const sum = await client.math.add.ask(5, 7);
  console.log('5 + 7 =', sum); // > 5 + 7 = 12

  // Call the 'tell' procedure, which returns void.
  await client.math.logToServer.tell('Client is connected.');
  // (The server's console will show "LOG: Client is connected.")

  // Attempting a call with incorrect types will result in a TypeScript error!
  // await client.math.add.ask('5', '7'); // ❌ Error: Argument of type 'string' is not assignable to parameter of type 'number'.

  // Cleanly close the connection.
  await server.close();
  await client.close();
}

main();
```

## Advanced Features

### Middleware

Middleware allows you to run common logic before and after a procedure executes.

```typescript
// logging-middleware.ts
import { middleware } from '@eleplug/erpc';

export const loggingMiddleware = middleware(async ({ path, input, next }) => {
  console.log(`--> Calling procedure '${path}' with input:`, input);
  const result = await next(); // Calls the next middleware or the final handler.
  console.log(`<-- Procedure '${path}' returned:`, result);
  return result;
});

// Apply the middleware in your API definition.
const e = initERPC.create();

const secureRouter = e.router({
  publicAdd: e.procedure
    .use(loggingMiddleware) // Apply the middleware.
    .ask((_env, a: number, b: number) => a + b),
});
```

### Object Pinning

`pin()` allows you to pass objects by reference, not by value.

```typescript
// server.ts
import { pin, createServer, initERPC } from '@eleplug/erpc';

// A stateful local object.
const createCounter = () => ({
  count: 0,
  increment() {
    this.count++;
    return this.count;
  },
});

const e = initERPC.create();
const pinRouter = e.router({
  // This procedure returns a proxy for a "pinned" counter object.
  getCounter: e.procedure.ask(() => {
    const counter = createCounter();
    return pin(counter); // <-- Use pin() here.
  }),
});

// ... create the server ...

// client.ts
import { free } from '@eleplug/erpc';

// ... create the client ...

// 1. Get the remote proxy for the counter from the server.
const remoteCounter = await client.getCounter.ask();

// 2. Calling methods on the proxy executes them on the server.
let value = await remoteCounter.increment();
console.log(value); // > 1

value = await remoteCounter.increment();
console.log(value); // > 2

// 3. (Optional) Manually release the server-side resource when done.
await free(remoteCounter);
```

### Streaming

Pass `ReadableStream` and `WritableStream` as arguments or return values.

```typescript
// api-definition.ts
const e = initERPC.create();

const streamRouter = e.router({
  // A procedure that accepts a ReadableStream.
  upload: e.procedure.tell(async (_env, stream: ReadableStream) => {
    for await (const chunk of stream) {
      console.log('Received chunk:', chunk);
    }
    console.log('Upload complete!');
  }),

  // A procedure that returns a ReadableStream.
  download: e.procedure.ask(() => {
    return new ReadableStream({
      start(controller) {
        controller.enqueue('Here');
        controller.enqueue('is');
        controller.enqueue('some');
        controller.enqueue('data');
        controller.close();
      },
    });
  }),
});

// client.ts

// 1. Upload data via a stream.
const myUploadStream = new ReadableStream({ /* ... */ });
await client.upload.tell(myUploadStream);

// 2. Download data from a stream.
const downloadableStream = await client.download.ask();
for await (const chunk of downloadableStream) {
  console.log('Downloaded chunk:', chunk);
}
```

## Core Concepts

| Concept          | Description                                                                 |
| ---------------- | --------------------------------------------------------------------------- |
| `initERPC`       | The entry point for creating an `erpc` instance.                            |
| `router`         | Organizes multiple `procedure`s or other `router`s into a nested API.       |
| `procedure`      | The basic unit of an API; a remotely callable function.                     |
| `.ask()`         | Defines a request-response style procedure.                                 |
| `.tell()`        | Defines a fire-and-forget style procedure.                                  |
| `middleware`     | Adds cross-cutting logic (e.g., logging, auth) to procedures.               |
| `pin()` / `free()` | Pass objects by reference and manually release them from the client.        |
| `createServer`   | Creates an `erpc` node from an API definition and a transport.                |
| `createClient`   | Creates a type-safe `erpc` client proxy from an API type and a transport.     |

## Architectural Philosophy

`erpc` is built on a few core principles:

*   **Type-Safety First**: Leveraging the full power of TypeScript's type system to eliminate common integration errors at compile time.
*   **Separation of Concerns**: Clearly separating the API definition, business logic, middleware, and the transport layer.
*   **Modularity and Extensibility**: The core runtime is built on a `Feature`-based dependency injection system. This makes the framework easy to maintain and allows advanced users to construct custom nodes with only the features they need.

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).