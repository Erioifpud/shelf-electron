# `@eleplug/mimic`

`mimic` is a minimalist serialization utility that provides a pre-configured, shared instance of `superjson`. Its purpose is to ensure consistent and robust data serialization and deserialization across the entire eleplug ecosystem.

[![npm version](https://img.shields.io/npm/v/@eleplug/mimic.svg)](https://www.npmjs.com/package/@eleplug/mimic)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The Problem It Solves

Standard `JSON.stringify()` and `JSON.parse()` have limitations. They cannot handle many common JavaScript data types, such as:

*   `Date`
*   `Map` and `Set`
*   `BigInt`
*   `undefined` (it gets converted to `null` in arrays or dropped in objects)
*   Binary data (`Uint8Array`)

When building distributed systems, it's crucial that both the client and server serialize and deserialize these types in a consistent and predictable way. Relying on vanilla JSON can lead to data loss, silent errors, and interoperability issues.

`mimic` solves this by standardizing on `superjson`, a library that extends JSON to support these complex types, and providing a single, pre-configured instance for all eleplug packages and application code to use.

## Features

*   **Zero-Configuration**: Simply import and use. `mimic` comes pre-configured for common use cases.
*   **Rich Type Support**: Natively handles `Date`, `Map`, `Set`, `RegExp`, `undefined`, and more, thanks to `superjson`.
*   **Binary Data Handling**: Includes a custom serializer to safely transport `Uint8Array` data by encoding it to a `base64` string, a standard and reliable method for representing binary data in text-based formats like JSON.
*   **Ecosystem Consistency**: Ensures that libraries like `@eleplug/erpc` and `@eleplug/muxen` and your own application logic all use the exact same serialization rules, preventing subtle bugs.

## Installation

⚠️ **Notice:** This project is in early development and has not been published to npm yet.

```bash
npm install @eleplug/mimic
```

## Usage

`mimic` exposes the core `superjson` API. You can use it as a drop-in replacement for the standard `JSON` object.

```typescript
import mimic from '@eleplug/mimic';

const myComplexObject = {
  id: 1,
  name: 'Example',
  createdAt: new Date(),
  metadata: new Map([['version', '1.0']]),
  binaryPayload: new Uint8Array([1, 2, 3, 4]),
  optionalField: undefined,
};

// 1. Stringify the object
// The result is a JSON string with special markers for complex types.
const jsonString = mimic.stringify(myComplexObject);

console.log(jsonString);
/*
Output might look like:
{
  "json": {
    "id": 1,
    "name": "Example",
    "createdAt": {
      "__superjson__": "Date",
      "value": "2023-..."
    },
    "metadata": {
      "__superjson__": "Map",
      "value": [["version", "1.0"]]
    },
    "binaryPayload": {
      "__superjson__": "custom",
      "type": "uint8array",
      "value": "AQIDBA=="
    },
    "optionalField": {
      "__superjson__": "undefined"
    }
  }
}
*/


// 2. Parse the string back into an object
const deserializedObject = mimic.parse(jsonString);

// The deserialized object has all its original types preserved.
console.log(deserializedObject.createdAt instanceof Date); // > true
console.log(deserializedObject.metadata instanceof Map); // > true
console.log(deserializedObject.binaryPayload instanceof Uint8Array); // > true
console.log(deserializedObject.optionalField === undefined); // > true
```

### Using with `serialize`/`deserialize`

For scenarios where you need a plain JavaScript object representation (e.g., before sending over a transport that handles its own stringification), you can use `serialize` and `deserialize`.

```typescript
// Creates a plain object with metadata, not a string.
const plainObject = mimic.serialize(myComplexObject);

// Reconstructs the original object with types from the plain object.
const reconstructedObject = mimic.deserialize(plainObject);
```

## How It Works

`mimic` is a very simple wrapper around `superjson`. Its entire implementation consists of:

1.  Importing `superjson`.
2.  Registering a custom serializer for `Uint8Array` that converts it to and from a `base64` string.
3.  Exporting the `superjson` object with its methods.

This small but crucial utility provides a "single source of truth" for serialization behavior.

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).