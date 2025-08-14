# The Eleplug Project

Welcome to the Eleplug monorepo! This repository contains a suite of powerful, interconnected TypeScript packages for building modern, modular, and distributed applications. The ecosystem provides a layered toolkit for everything from low-level binary serialization and reliable transport protocols to a full-fledged plugin orchestration system.

While these packages culminate in `elep`, a framework for extensible Electron applications, **each layer is designed to be independently useful and applicable to a wide range of domains**, including web servers, microservices, IoT, and complex concurrent programming.

## Project Status

This project is currently in the early stages of development, with many features and improvements still to come. However, the core logic has been carefully implemented and extensively tested to ensure stability and reliability.

## Core Philosophy & Architecture

The entire ecosystem is built on a few key principles:

1.  **Layered Abstraction**: Each package represents a distinct layer of abstraction. Higher layers depend on the stable interfaces of lower layers, allowing you to pick and choose the level of abstraction you need for your project.
2.  **End-to-End Type Safety**: Leveraging modern TypeScript, the entire stack is designed to be type-safe, catching integration errors at compile time, whether you're communicating between browser and server, between microservices, or between plugins.
3.  **Separation of Concerns**: Complex problems are broken down into smaller, focused packages. Dependency resolution (`plexus`) is separate from communication (`ebus`), which is separate from the underlying transport protocol (`muxen`, `h2`).
4.  **Transport-Agnostic Design**: The communication layers (`erpc`, `ebus`) are decoupled from the transport implementation, allowing them to run over WebSockets, HTTP/2, WebRTC, or any custom link.

### Architectural Layers

The relationship between the packages can be visualized as a stack. You can adopt the entire stack for a complete solution or use individual layers and packages to solve specific problems.

```
+------------------------------------------------------+
|             Application & Orchestration              |
|  esys (Plugin System), elep (Electron Framework)     |
+--------------------------+---------------------------+
                           |
+--------------------------v---------------------------+
|        Dependency Management & Plugin Contract       |
|          plexus (Resolver), anvil (Contract)         |
+--------------------------+---------------------------+
                           |
+--------------------------v---------------------------+
|     High-Level Communication & Messaging Patterns    |
|               ebus (Message Bus), erpc (RPC)         |
+--------------------------+---------------------------+
                           |
+--------------------------v---------------------------+
|   Transport Abstraction & Reliable Implementations   |
|  transport, muxen (Multiplexer), h2-client/server    |
+--------------------------+---------------------------+
                           |
+--------------------------v---------------------------+
|      Serialization & Low-Level Utilities             |
|          mimic (JSON+), serbin (Binary)              |
+------------------------------------------------------+
```

## Project Structure & Packages

This is a `pnpm` monorepo. All packages are located in the `packages/` directory.

| Package                                          | Description                                                                                             | Use Cases                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Application & Orchestration**                  |                                                                                                         |                                                     |
| [`elep`](./packages/elep)                        | A "batteries-included" framework for building plugin-based **Electron** applications.                   | Desktop Apps                                        |
| [`esys`](./packages/esys)                        | A core system orchestration engine for managing plugin lifecycle, state, and dependencies.              | Plugin Systems, Serverless Runtimes, IDEs             |
| [`plexus`](./packages/plexus)                    | A powerful, standalone backtracking dependency resolver.                                                | Package Managers, Build Tools                       |
| [`anvil`](./packages/anvil)                      | Defines the standard contract (`Plugin` interface) and type-safe context for plugins.                   | Plugin-based Architectures                          |
| **High-Level Communication**                     |                                                                                                         |                                                     |
| [`ebus`](./packages/ebus)                        | A type-safe, distributed message bus for Pub/Sub and P2P communication.                                 | Microservices, Real-time Apps, Event-driven Systems |
| [`erpc`](./packages/erpc)                        | An end-to-end type-safe RPC framework with middleware, streaming, and object pinning.                   | Web APIs, Client-Server Communication             |
| **Transport Layer**                              |                                                                                                         |                                                     |
| [`transport`](./packages/transport)              | **(Abstract)** Defines the core `Transport` and `Channel` interfaces.                                   | Foundational                                        |
| [`muxen`](./packages/muxen)                      | A protocol that adds reliability and multiplexing over any simple message link (e.g., a WebSocket).     | WebSockets, WebRTC, IPC                             |
| [`h2-client`](./packages/h2-client) / [`h2-server`](./packages/h2-server) | `Transport` implementations over HTTP/2.                                          | High-performance Backend Services                   |
| [`transport-mem`](./packages/transport-mem)      | An in-memory `Transport` for testing and in-process concurrency.                                        | Unit/Integration Testing, Concurrent Programming    |
| **Utilities**                                    |                                                                                                         |                                                     |
| [`mimic`](./packages/mimic)                      | A pre-configured `superjson` instance for rich JSON serialization (`Date`, `Map`, etc.).                | General Purpose                                     |
| [`serbin`](./packages/serbin)                    | A fast, zero-dependency binary serialization library for performance-critical paths.                    | Game Networking, IoT, High-throughput APIs        |

## Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) (LTS version recommended)
*   [pnpm](https://pnpm.io/)

### Installation

Clone the repository and install all dependencies from the root directory.

```bash
git clone https://github.com/your-username/eleplug.git
cd eleplug
pnpm install
```

### Build

To build all packages in the correct topological order, run the following command from the root directory:

```bash
pnpm build
```

### Exploring the Packages

Each package is designed to be usable on its own and has its own `README.md` with detailed instructions.

*   **For type-safe client-server communication?** Start with `@eleplug/erpc` and choose a transport like `@eleplug/h2-client`/`@eleplug/h2-server`.
*   **For reliable messaging over WebSockets?** Use `@eleplug/muxen` to upgrade a raw WebSocket into a full `@eleplug/transport` instance.
*   **For building a complex plugin system?** Dive into `@eleplug/esys` and `@eleplug/plexus`.
*   **For a complete desktop app solution?** Use `@eleplug/elep` and see the example at `@eleplug/elep-example`.

### Running the Example

⚠️ **Notice:** The `elep-example` package does not exist yet. A full Electron demo may be provided in the future.

The `elep-example` package provides a fully functional demonstration of the entire stack in an Electron context. To run it:

```bash
# From the monorepo root
pnpm --filter elep-example start
```

## How the Pieces Fit Together

The power of the Eleplug ecosystem comes from how the layers compose. For example, a simple RPC call can be traced through the stack:

1. An **application** uses a type-safe `erpc` client to call a remote procedure.
2. The `erpc` client sends the request through a `Transport` instance, such as one created by `muxen`.
3. The `Transport` layer is responsible for serializing the request payload. You can use `serbin` to serialize objects into binary, or `mimic` to serialize them into strings.
4. `muxen` wraps the rpc payload in a reliable, sequenced packet and sends it over a simple `Link` (like a WebSocket).
5. On the receiving side, `muxen` ensures reliable, in-order delivery to the `erpc` server, which then executes the procedure.

This layered design keeps each component focused and testable, while collectively forming a powerful and cohesive toolkit for building sophisticated applications.


## License

This project is licensed under the [MIT License](./LICENSE).