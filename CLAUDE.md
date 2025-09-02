# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Eleplug Project is a TypeScript monorepo providing a layered toolkit for building modern, modular applications. It features:
- **Layered Architecture**: From low-level binary serialization to high-level plugin orchestration
- **Full Type Safety**: End-to-end TypeScript with compile-time error checking
- **Transport-Agnostic**: Works over WebSockets, HTTP/2, WebRTC, or custom links
- **Electron Framework**: Complete solution for plugin-based desktop applications

## Key Commands

### Development & Build
```bash
# Install dependencies
pnpm install

# Build all packages in topological order
pnpm build

# Run tests for all packages
pnpm test

# Run specific package test
pnpm --filter @eleplug/erpc test

# Development mode for example Electron app
pnpm --filter plugin-example dev

# Type checking
pnpm --filter @eleplug/elep typecheck
```

### Package-Specific Commands
Each package supports:
- `build`: `tsup` for library builds
- `test`: `vitest` for testing
- `typecheck`: `tsc --noEmit` for type checking

## Architecture Layers

```
┌──────────────────────────────────────────────────────┐
│            Application & Orchestration               │
│  esys (Plugin System), elep (Electron Framework)     │
├────────────────────────┬─────────────────────────────┤
│                        │                             │
├────────────────────────┴─────────────────────────────┤
│        Dependency Management & Plugin Contract       │
│          plexus (Resolver), anvil (Contract)         │
├────────────────────────┬─────────────────────────────┤
│                        │                             │
├────────────────────────┴─────────────────────────────┤
│     High-Level Communication & Messaging Patterns    │
│               ebus (Message Bus), erpc (RPC)         │
├────────────────────────┬─────────────────────────────┤
│                        │                             │
├────────────────────────┴─────────────────────────────┤
│   Transport Abstraction & Reliable Implementations   │
│  transport, muxen (Multiplexer), h2-client/server    │
├────────────────────────┬─────────────────────────────┤
│                        │                             │
├────────────────────────┴─────────────────────────────┤
│      Serialization & Low-Level Utilities             │
│          mimic (JSON+), serbin (Binary)              │
└──────────────────────────────────────────────────────┘
```

## Package Structure

All packages are in `packages/` directory:

**Core Packages:**
- `@eleplug/elep` - Electron framework (main entry point)
- `@eleplug/esys` - Plugin system orchestration
- `@eleplug/plexus` - Dependency resolver
- `@eleplug/anvil` - Plugin contract definitions
- `@eleplug/ebus` - Message bus for pub/sub
- `@eleplug/erpc` - Type-safe RPC framework
- `@eleplug/muxen` - Reliable transport multiplexer
- `@eleplug/transport` - Transport abstractions
- `@eleplug/serbin` - Binary serialization
- `@eleplug/mimic` - JSON serialization

**Supporting Packages:**
- `@eleplug/h2-client` / `@eleplug/h2-server` - HTTP/2 transport
- `@eleplug/transport-mem` - In-memory transport
- `@eleplug/elep-dev` - Development tools
- `@eleplug/elep-boot` - Bootstrapping utilities
- `plugin-example` - Complete Electron example app

## Development Workflow

1. **Start with example**: Run `pnpm --filter plugin-example dev` to see the full stack
2. **Individual package development**: Use `pnpm --filter <package> test` for focused development
3. **Cross-package changes**: Use `pnpm build` to build dependencies in correct order
4. **Testing**: Use `pnpm test` to run all tests with Vitest

## Configuration

- **Build**: Uses `tsup` for most packages, `vite` for Electron apps
- **Testing**: Vitest with Node.js environment
- **TypeScript**: Project references in root `tsconfig.json`
- **Development**: Vite aliases configured in `vite.config.shared.ts`