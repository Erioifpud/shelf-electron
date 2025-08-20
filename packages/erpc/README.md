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
```

You will also need a specific transport implementation. For testing and in-process communication, you can use `@eleplug/transport-mem`:

```bash
npm install @eleplug/transport-mem
```

## Quick Start

Let's illustrate the core functionality of `erpc` with a basic example.

### 1. Define Your API

Use the exported `rpc` object to build procedures. An API is simply a plain JavaScript object where procedures and nested objects (routers) are defined.

```typescript
// api-definition.ts
import { rpc } from '@eleplug/erpc';

// 1. Use a plain object to act as a router and organize your procedures.
export const appRouter = {
  // A simple 'ask' (request-response) procedure.
  greeting: rpc.ask(
    (env, name: string) => `Hello, ${name}!`
  ),

  // A nested object for organization.
  math: {
    add: rpc.ask((_env, a: number, b: number) => a + b),
    // A 'tell' (fire-and-forget) procedure with no return value.
    logToServer: rpc.tell((_env, message: string) => {
      console.log(`LOG: ${message}`);
    }),
  },
};

// 2. Export the type of the API router. This is the key to type-safety!
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
  const greeting = await client.procedure.greeting.ask('erpc');
  console.log('Greeting from server:', greeting); // > Greeting from server: Hello, erpc!

  const sum = await client.procedure.math.add.ask(5, 7);
  console.log('5 + 7 =', sum); // > 5 + 7 = 12

  // Call the 'tell' procedure, which returns void.
  await client.procedure.math.logToServer.tell('Client is connected.');
  // (The server's console will show "LOG: Client is connected.")

  // Attempting a call with incorrect types will result in a TypeScript error!
  // await client.procedure.math.add.ask('5', '7'); // ❌ Error: Argument of type 'string' is not assignable to parameter of type 'number'.

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
import { rpc, middleware } from '@eleplug/erpc';

export const loggingMiddleware = middleware(async ({ path, input, next }) => {
  console.log(`--> Calling procedure '${path}' with input:`, input);
  const result = await next(); // Calls the next middleware or the final handler.
  console.log(`<-- Procedure '${path}' returned:`, result);
  return result;
});

// Apply the middleware in your API definition.
const secureRouter = {
  publicAdd: rpc
    .use(loggingMiddleware) // Apply the middleware.
    .ask((_env, a: number, b: number) => a + b),
};
```

### Context Injection

For tasks like authentication or providing a database connection, you need to create a context for each request. The `inject` function allows you to do this cleanly.

```typescript
// api-with-context.ts
import { 
  createProcedureBuilder, 
  inject, 
  type InjectorFn,
  type Env
} from '@eleplug/erpc';

// 1. Define the shape of your context.
interface MyContext {
  userId?: string;
  isAdmin: boolean;
}

// 2. Create a procedure builder that requires this context.
const p = createProcedureBuilder<MyContext, any, any>();

// 3. Define your API. Public routes can use the default `rpc` builder.
//    Protected routes use the context-aware `p` builder.
const authApi = {
  getSecretData: p.ask((env: Env<MyContext>) => {
    if (!env.ctx.isAdmin) {
      throw new Error("Unauthorized");
    }
    return { secret: "The cake is a lie." };
  })
};

// 4. Create an "injector" function that creates the context.
//    It can receive metadata from the client (e.g., auth tokens).
const authInjector: InjectorFn<MyContext> = async (meta) => {
  const token = meta?.[0]; // Assume token is the first metadata item.
  if (token === 'admin-token') {
    return { context: { userId: 'user-123', isAdmin: true } };
  }
  return { context: { isAdmin: false } };
};

// 5. "Bake in" the injector to create a self-sufficient API for the server.
export const serverReadyApi = inject(authApi, authInjector);

// Now, `serverReadyApi` can be passed to `createServer`.

// On the client side, you would use `.meta()` to attach the token:
// await client.procedure.meta('admin-token').getSecretData.ask();
```

### Object Pinning

`pin()` allows you to pass objects by reference, not by value.

```typescript
// server.ts
import { rpc, pin, createServer } from '@eleplug/erpc';

// A stateful local object.
const createCounter = () => ({
  count: 0,
  increment() {
    this.count++;
    return this.count;
  },
});

const pinRouter = {
  // This procedure returns a proxy for a "pinned" counter object.
  getCounter: rpc.ask(() => {
    const counter = createCounter();
    return pin(counter); // <-- Use pin() here.
  }),
};

// ... create the server with pinRouter ...

// client.ts
import { free } from '@eleplug/erpc';

// ... create the client ...

// 1. Get the remote proxy for the counter from the server.
const remoteCounter = await client.procedure.getCounter.ask();

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
import { rpc } from '@eleplug/erpc';

const streamRouter = {
  // A procedure that accepts a ReadableStream.
  upload: rpc.tell(async (_env, stream: ReadableStream) => {
    for await (const chunk of stream) {
      console.log('Received chunk:', chunk);
    }
    console.log('Upload complete!');
  }),

  // A procedure that returns a ReadableStream.
  download: rpc.ask(() => {
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
};

// client.ts

// 1. Upload data via a stream.
const myUploadStream = new ReadableStream({ /* ... */ });
await client.procedure.upload.tell(myUploadStream);

// 2. Download data from a stream.
const downloadableStream = await client.procedure.download.ask();
for await (const chunk of downloadableStream) {
  console.log('Downloaded chunk:', chunk);
}
```

## Core Concepts

| Concept              | Description                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------- |
| `rpc`                | The default `ProcedureBuilder` instance for creating procedures with a `void` initial context.            |
| Router (Plain Object) | Organizes procedures into a nested API using plain JavaScript objects.                                  |
| `procedure`          | The basic unit of an API; a remotely callable function created by a `ProcedureBuilder`.                 |
| `.ask()`             | Defines a request-response style procedure on a builder.                                                |
| `.tell()`            | Defines a fire-and-forget style procedure on a builder.                                                 |
| `middleware`         | A function to create middleware for adding cross-cutting logic (e.g., logging, auth) to procedures.     |
| `inject`             | A function to provide an initial context (e.g., for auth or DB connections) to an entire API.           |
| `pin()` / `free()`   | Pass objects by reference and manually release them from the client.                                    |
| `createServer`       | Creates an `erpc` node from an API definition and a transport.                                          |
| `createClient`       | Creates a type-safe `erpc` client proxy from an API type and a transport.                               |

## Architectural Philosophy

`erpc` is built on a few core principles:

*   **Type-Safety First**: Leveraging the full power of TypeScript's type system to eliminate common integration errors at compile time.
*   **Separation of Concerns**: Clearly separating the API definition, business logic, middleware, and the transport layer.
*   **Modularity and Extensibility**: The core runtime is built on a `Feature`-based dependency injection system. This makes the framework easy to maintain and allows advanced users to construct custom nodes with only the features they need.

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).