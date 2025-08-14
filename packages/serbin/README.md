# `@eleplug/serbin`

`serbin` is a fast, compact, zero-dependency binary serialization library for TypeScript and JavaScript. It provides a highly efficient alternative to text-based formats like JSON for situations where performance and payload size are critical.

[![npm version](https://img.shields.io/npm/v/@eleplug/serbin.svg)](https://www.npmjs.com/package/@eleplug/serbin)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## The Problem It Solves

While JSON is ubiquitous, its text-based nature introduces overhead:

*   **Verbosity**: Numbers are stored as strings, and object keys are repeated as strings, increasing payload size.
*   **Performance**: Parsing and stringifying text is computationally more expensive than working directly with binary data.
*   **Limited Types**: JSON has no native representation for binary data (`Uint8Array`) or `undefined`. Binary data must be base64-encoded, further increasing its size.

`serbin` addresses these issues by implementing a simple, custom binary protocol that encodes JavaScript values directly into bytes, resulting in smaller payloads and faster processing.

## Features

*   **Compact Binary Format**: Significantly reduces payload size compared to JSON, especially for objects with numerical or binary data.
*   **High Performance**: Bypasses the overhead of text parsing, leading to faster serialization and deserialization.
*   **Zero Dependencies**: A lean, self-contained library with no external dependencies.
*   **Native Binary Support**: `Uint8Array` is treated as a first-class citizen, written directly to the byte stream without any encoding overhead.
*   **Type-Safe Deserialization**: The `from<T>()` function allows you to cast the deserialized object to its expected type.

## Installation

⚠️ **Notice:** This project is in early development and has not been published to npm yet.

```bash
npm install @eleplug/serbin
```

## Usage

The API is straightforward, with two main functions: `byteify` to serialize and `from` to deserialize.

```typescript
import { byteify, from } from '@eleplug/serbin';

// 1. Define your data object.
const originalData = {
  id: 12345,
  name: 'serbin-test',
  active: true,
  value: null,
  description: undefined,
  metadata: {
    version: 1.1,
    tags: ['binary', 'fast'],
  },
  payload: new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]),
};

// 2. Serialize the object into a Uint8Array.
const binaryData = byteify(originalData);

console.log('Serialized Binary Data:', binaryData);
// > Serialized Binary Data: Uint8Array(83) [ 8, 2, 5, 2, ... ]
console.log(`Payload size: ${binaryData.length} bytes`);

// 3. Deserialize the bytes back into a JavaScript object.
// Use the generic for type safety.
type DataType = typeof originalData;
const deserializedData = from<DataType>(binaryData);

console.log('Deserialized Data:', deserializedData);
/*
> Deserialized Data: {
    id: 12345,
    name: 'serbin-test',
    active: true,
    value: null,
    description: undefined,
    metadata: { version: 1.1, tags: [ 'binary', 'fast' ] },
    payload: Uint8Array(4) [ 222, 173, 190, 239 ]
  }
*/

// Verify that the data is identical.
console.assert(JSON.stringify(originalData) === JSON.stringify(deserializedData));
```

## Supported Data Types

`serbin` is designed for speed and simplicity, and supports the following core JavaScript types:

*   `string`
*   `number` (encoded as 64-bit float)
*   `boolean`
*   `null`
*   `undefined`
*   `Uint8Array` (for binary data)
*   `Array` (of any other supported type)
*   `object` (plain objects with string keys and values of any other supported type)

## Limitations

It is important to understand what `serbin` is **not**. It is not a "rich" serializer like `superjson` (used by `@eleplug/mimic`). Its focus on performance and simplicity comes with trade-offs:

*   **No Complex Types**: It does not support `Date`, `Map`, `Set`, `BigInt`, `RegExp`, or other complex object types out of the box.
*   **No Circular References**: Attempting to serialize an object with circular references will result in a stack overflow.

`serbin` is an ideal choice for serializing well-defined Data Transfer Objects (DTOs) and in performance-sensitive applications where the data structures are known and do not contain complex types or cycles.

## Binary Protocol Overview

`serbin` uses a simple Tag-Length-Value (TLV) style protocol. Each value is prefixed with a 1-byte tag that identifies its type.

| Tag  | Value (Hex) | Type           | Description                             |
| ---- | ----------- | -------------- | --------------------------------------- |
| `00` | `0x00`      | `null`         | A single byte.                          |
| `01` | `0x01`      | `undefined`    | A single byte.                          |
| `02` | `0x02`      | `false`        | A single byte.                          |
| `03` | `0x03`      | `true`         | A single byte.                          |
| `04` | `0x04`      | `number`       | Followed by 8 bytes (64-bit float).     |
| `05` | `0x05`      | `string`       | Followed by a 4-byte length and data.   |
| `06` | `0x06`      | `Uint8Array`   | Followed by a 4-byte length and data.   |
| `07` | `0x07`      | `Array`        | Followed by a 4-byte element count.     |
| `08` | `0x08`      | `object`       | Followed by a 4-byte key-value pair count. |

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).