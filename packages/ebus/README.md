# `@eleplug/ebus`

`ebus` is a type-safe message bus for TypeScript, designed for building lightweight, structured, and secure communication networks. It is built on the solid foundation of [`@eleplug/erpc`](https://github.com/your-repo/erpc) and extends its powerful point-to-point RPC capabilities with high-level patterns like topic-based Publish/Subscribe, efficient hierarchical routing, and secure inter-bus connectivity—all while preserving end-to-end type safety.

[![npm version](https://img.shields.io/npm/v/@eleplug/ebus.svg)](https://www.npmjs.com/package/@eleplug/ebus)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Core Features ✨

*   **Type-Safe Pub/Sub**: Define a consumer's API for a topic once, and the publisher's client (`emiter`) is automatically typed. This prevents mismatches between published messages and subscribed handlers at compile time.
*   **Type-Safe P2P Communication**: Create logical, addressable `Node`s on the bus and establish fully-typed, point-to-point communication channels between them, leveraging `erpc`'s core strength.
*   **Group-Based Security & Isolation**: Assign nodes to groups to enforce permissions at multiple levels:
    *   **Connect-Time Checks**: `connectTo()` will fail-fast at connection time if the source and target nodes do not share a common group.
    *   **Execution-Time Checks**: Enforces permissions at the last moment of message delivery, ensuring only calls from authorized groups are executed.
    *   **Gateway Policies**: Configure `allowList` and `denyList` when bridging buses to control which groups of nodes can communicate across bus boundaries.
*   **Hierarchical Networking**: Connect multiple `ebus` instances together to form a larger, tree-like network. The bus handles routing and state propagation seamlessly and efficiently up and down the topology.
*   **Rich Data Type Broadcasting**: Thanks to its `erpc` foundation, `ebus` can broadcast complex data types like **Streams**, `Pin`'d object references, and more, not just JSON-serializable data.
*   **Intelligent Message Dispatching**: When broadcasting, `ebus` automatically creates deep, isolated copies of messages for each downstream route, with special handling for complex types (e.g., fanning-out `ReadableStream`s, fanning-in `WritableStream`s).
*   **Advanced Broadcast `ask`**: Publishers can broadcast a request and receive an `AsyncIterable` of results from all responding subscribers, enabling powerful patterns for data aggregation and service discovery.

## Installation

⚠️ **Notice:** This project is in early development and has not been published to npm yet.

```bash
npm install @eleplug/ebus @eleplug/erpc
```

You will also need a transport implementation, such as `@eleplug/transport-mem` for in-process communication.

```bash
npm install @eleplug/transport-mem
```

## Core Concepts

| Concept          | Description                                                                                             |
| :--------------- | :------------------------------------------------------------------------------------------------------ |
| **Bus**          | The main EBUS instance, created with `root()` or `bridge()`. It manages connections, routing, and all nodes. |
| **Node**           | A logical, addressable entity on the bus. Your application interacts with the bus through `Node` instances. |
| **Group**          | A security label assigned to a node, used to control permission for interaction between nodes.          |
| **Topic**          | A named channel for broadcast (Pub/Sub) messages.                                                       |
| `bus.join()`       | The entry point to create a new `Node` and register it with the bus.                                    |
| `node.subscribe()` | Subscribes a `Node` to a topic, providing an API to handle incoming messages.                           |
| `node.emiter()`    | Creates a type-safe publisher client (`PublisherClient`) to send messages to a topic.                        |
| `node.connectTo()` | Creates a type-safe P2P client to communicate directly with another specific `Node`.                    |

## How to Use

Let's build a simple multi-user environment where nodes can broadcast messages and communicate directly based on their group permissions.

### 1. Create a Bus Instance

The `bus` is the central coordinator. Use `root()` to create a standalone bus.

```typescript
import { root } from '@eleplug/ebus';

async function setup() {
  const bus = await root();
  // ...
}
```

### 2. Define Shared APIs

`ebus` provides pre-configured `erpc` builders (`p2p` and `pubsub`) that automatically inject the correct context (`BusContext` or `TopicContext`).

```typescript
// apis.ts
import { p2p, pubsub } from '@eleplug/ebus';
import type { BusContext, TopicContext } from '@eleplug/ebus';

// P2P API for direct user-to-user messages
export const userApi = {
  sendMessage: p2p.tell(
    ({ ctx: BusContext }, message: string) => {
      console.log(
        `[Node ${ctx.localNodeId}] Received DM from ${ctx.sourceNodeId} (groups: ${ctx.sourceGroups.join(', ')}): "${message}"`
      );
    }
  ),
};

// Pub/Sub API for a public chat room
export const chatApi = {
  postMessage: pubsub.tell(
    ({ ctx: TopicContext }, username: string, message: string) => {
      console.log(
        `[Topic: ${ctx.topic}] ${username}: ${message} (from node ${ctx.sourceNodeId})`
      );
    }
  ),
};

// Export types for type-safety
export type UserApi = typeof userApi;
export type ChatApi = typeof chatApi;
```

### 3. Join Nodes to the Bus

Create nodes, join them to the bus with assigned groups, subscribe to topics, and expose APIs.

```typescript
// main.ts
import { root, type Node, GroupPermissionError } from '@eleplug/ebus';
import { userApi, chatApi, type UserApi, type ChatApi } from './apis';

async function main() {
  const bus = await root();

  // --- Logger Node (Subscriber, in 'system' group) ---
  const loggerNode = await bus.join({ id: 'logger', groups: ['system'] });
  await loggerNode.subscribe('public-chat', chatApi);
  console.log('Logger node has subscribed to public-chat.');

  // --- User Node "Alice" (Publisher & P2P Target, in 'users' group) ---
  const aliceNode = await bus.join<UserApi>({
    id: 'alice',
    groups: ['users'],
    api: userApi, // Expose the P2P UserApi
  });
  console.log('Alice has joined the bus.');

  // Alice sends a message to the public chat
  const chatPublisher = aliceNode.emiter<ChatApi>('public-chat');
  await chatPublisher.postMessage.tell('Alice', 'Hello everyone!');
  // > [Topic: public-chat] Alice: Hello everyone! (from node alice)

  // --- User Node "Bob" (P2P Caller, in 'users' group) ---
  const bobNode = await bus.join({ id: 'bob', groups: ['users'] });
  console.log('Bob has joined the bus.');

  // Bob gets a P2P client to talk to Alice (Succeeds, because they share the 'users' group)
  const aliceClient = await bobNode.connectTo<UserApi>('alice');
  await aliceClient.procedure.sendMessage.tell("Hi Alice, it's Bob!");
  // > [Node alice] Received DM from bob (groups: users): "Hi Alice, it's Bob!"

  // --- Admin Node "Admin" (P2P Caller, in 'admins' group) ---
  const adminNode = await bus.join({ id: 'admin', groups: ['admins'] });
  console.log('Admin has joined the bus.');

  // Admin tries to connect to Alice (Fails, because they have no common group)
  try {
    await adminNode.connectTo<UserApi>('alice');
  } catch (e) {
    if (e instanceof GroupPermissionError) {
      console.error(`Connection failed as expected: ${e.message}`);
    }
  }
  // > Connection failed as expected: Node 'admin' (groups: [admins]) does not have permission to connect to node 'alice' (groups: [users]).

  // Clean up
  await bus.close();
}

main();
```

## Advanced Features

### Broadcast `ask` with `.all()`

Publish a request to a topic and aggregate results from all subscribers.

```typescript
import { pubsub } from '@eleplug/ebus';
import type { TopicContext } from '@eleplug/ebus';

// API definition for a "bot" service
const botApi = {
  getStatus: pubsub.ask(
    ({ ctx: TopicContext }) => `Bot ${ctx.localNodeId} is OK`
  ),
};

// --- On the publisher node (e.g., adminNode from previous example) ---
const botPublisher = adminNode.emiter<typeof botApi>('system-bots');

// .all() returns an AsyncIterable
const results = botPublisher.getStatus.all();

console.log('Pinging all bots...');
for await (const result of results) {
  if (result.isOk) {
    console.log('Response:', result.value);
  } else {
    console.error('Error from a bot:', result.error);
  }
}
console.log('All bots have responded.');
```

### Hierarchical Networking with Gateway Policies

You can connect one bus to another using `bridge()`, forming a tree-like network structure. Bridges can also be configured with security policies.

```typescript
import { root, bridge } from '@eleplug/ebus';
import { MemoryConnector } from '@eleplug/transport-mem';

// 1. Create a parent bus.
const parentBus = await root();

// 2. Use a connector to get a transport pair.
const { client: childTransport, server: parentTransport } = new MemoryConnector();

// 3. The parent "bridges" its side of the connection and sets policies.
//    Only allow nodes from the 'public' group to be announced through this bridge.
await parentBus.bridge({
  transport: parentTransport,
  allowList: ['public'],
});

// 4. The child bus is created with a transport pointing to the parent.
const childBus = await bridge(childTransport);

// Now, nodes on the child bus can seamlessly communicate with nodes on the
// parent bus, and vice-versa. Routing and security policies are handled automatically.
```

## Architecture

`ebus` is designed as a layered system on top of `erpc`:

1.  **Bridge Layer**: Manages the physical `erpc` connections between bus instances. This layer also acts as a **security gateway**, enforcing group-based `allowList`/`denyList` policies for runtime messages at the boundary.
2.  **Routing Layer**: Maintains knowledge of where nodes and topic subscribers are located across the network. It acts as an **admission controller**, validating the legitimacy of new nodes against bridge policies at registration time.
3.  **Protocol Layer**: Handles P2P and Pub/Sub message dispatch, session management for `ask`/`all` calls, and message cloning.
4.  **API Layer**: Provides the final, user-friendly `Node` and `emiter` abstractions.

This structure creates a **hierarchical, tree-like network topology**. Messages are routed efficiently up and down the tree, making it ideal for scenarios like in-process micro-frontends, browser extension components, or any application requiring structured, lightweight inter-module communication without the overhead of a large-scale message queue.

This modular, feature-based architecture ensures that each component has a clear responsibility, making the system robust and extensible.

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).