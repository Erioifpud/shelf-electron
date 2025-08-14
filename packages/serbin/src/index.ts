// -----------------------------------------------------------------------------
// Protocol Definition
// -----------------------------------------------------------------------------
const TAG_NULL = 0x00;
const TAG_UNDEFINED = 0x01;
const TAG_FALSE = 0x02;
const TAG_TRUE = 0x03;
const TAG_NUMBER = 0x04; // 64-bit float
const TAG_STRING = 0x05; // U32 length-prefixed
const TAG_BINARY = 0x06; // U32 length-prefixed Uint8Array
const TAG_ARRAY = 0x07; // U32 count-prefixed
const TAG_OBJECT = 0x08; // U32 pair-count-prefixed

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Concatenates multiple Uint8Array chunks into a single Uint8Array.
 * More efficient than repeated array spreading.
 * @param arrays An array of Uint8Array chunks.
 * @returns A single merged Uint8Array.
 */
function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Encoders shared across serialization calls
const textEncoder = new TextEncoder();

// -----------------------------------------------------------------------------
// Serialization (`byteify`)
// -----------------------------------------------------------------------------

function serialize(value: any): Uint8Array {
  // Primitives
  if (value === null) return new Uint8Array([TAG_NULL]);
  if (value === undefined) return new Uint8Array([TAG_UNDEFINED]);
  if (value === false) return new Uint8Array([TAG_FALSE]);
  if (value === true) return new Uint8Array([TAG_TRUE]);

  const type = typeof value;

  if (type === "number") {
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    view.setUint8(0, TAG_NUMBER);
    view.setFloat64(1, value, false); // Big-endian
    return new Uint8Array(buffer);
  }

  if (type === "string") {
    const strBytes = textEncoder.encode(value);
    const buffer = new ArrayBuffer(5 + strBytes.length);
    const view = new DataView(buffer);
    view.setUint8(0, TAG_STRING);
    view.setUint32(1, strBytes.length, false); // Big-endian
    new Uint8Array(buffer).set(strBytes, 5);
    return new Uint8Array(buffer);
  }

  // Complex types
  if (value instanceof Uint8Array) {
    const buffer = new ArrayBuffer(5 + value.length);
    const view = new DataView(buffer);
    view.setUint8(0, TAG_BINARY);
    view.setUint32(1, value.length, false);
    new Uint8Array(buffer).set(value, 5);
    return new Uint8Array(buffer);
  }

  if (Array.isArray(value)) {
    const chunks: Uint8Array[] = [];
    const header = new ArrayBuffer(5);
    const headerView = new DataView(header);
    headerView.setUint8(0, TAG_ARRAY);
    headerView.setUint32(1, value.length, false);
    chunks.push(new Uint8Array(header));
    for (const item of value) {
      chunks.push(serialize(item));
    }
    return concatUint8Arrays(chunks);
  }

  if (type === "object") {
    const keys = Object.keys(value);
    const chunks: Uint8Array[] = [];
    const header = new ArrayBuffer(5);
    const headerView = new DataView(header);
    headerView.setUint8(0, TAG_OBJECT);
    headerView.setUint32(1, keys.length, false);
    chunks.push(new Uint8Array(header));

    for (const key of keys) {
      chunks.push(serialize(key)); // Serialize key (as string)
      chunks.push(serialize(value[key])); // Serialize value
    }
    return concatUint8Arrays(chunks);
  }

  throw new Error(`Unsupported type for serialization: ${type}`);
}

/**
 * Serializes a JavaScript value into a Uint8Array using a custom binary protocol.
 * @param value The JavaScript value to serialize.
 * @returns A Uint8Array representing the serialized data.
 */
export const byteify = (value: any): Uint8Array => serialize(value);

// -----------------------------------------------------------------------------
// Deserialization (`unbyteify`)
// -----------------------------------------------------------------------------

class Deserializer {
  private view: DataView;
  private textDecoder = new TextDecoder();
  private offset = 0;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  public read(): any {
    const tag = this.view.getUint8(this.offset++);

    switch (tag) {
      case TAG_NULL:
        return null;
      case TAG_UNDEFINED:
        return undefined;
      case TAG_FALSE:
        return false;
      case TAG_TRUE:
        return true;

      case TAG_NUMBER: {
        const value = this.view.getFloat64(this.offset, false);
        this.offset += 8;
        return value;
      }

      case TAG_STRING: {
        const length = this.view.getUint32(this.offset, false);
        this.offset += 4;
        const strBytes = new Uint8Array(
          this.view.buffer,
          this.view.byteOffset + this.offset,
          length
        );
        this.offset += length;
        return this.textDecoder.decode(strBytes);
      }

      case TAG_BINARY: {
        const length = this.view.getUint32(this.offset, false);
        this.offset += 4;
        const value = new Uint8Array(
          this.view.buffer,
          this.view.byteOffset + this.offset,
          length
        );
        this.offset += length;
        return value;
      }

      case TAG_ARRAY: {
        const count = this.view.getUint32(this.offset, false);
        this.offset += 4;
        const arr = [];
        for (let i = 0; i < count; i++) {
          arr.push(this.read());
        }
        return arr;
      }

      case TAG_OBJECT: {
        const count = this.view.getUint32(this.offset, false);
        this.offset += 4;
        const obj: { [key: string]: any } = {};
        for (let i = 0; i < count; i++) {
          const key = this.read(); // Keys are always deserialized as strings
          const value = this.read();
          obj[key] = value;
        }
        return obj;
      }

      default:
        throw new Error(`Unknown type tag encountered: 0x${tag.toString(16)}`);
    }
  }
}

/**
 * Deserializes a Uint8Array back into a JavaScript value using a custom binary protocol.
 * @template T The expected type of the deserialized object.
 * @param bytes The Uint8Array to deserialize.
 * @returns The deserialized JavaScript value, cast to type T.
 */
export const from = <T = unknown>(bytes: Uint8Array): T => {
  if (!bytes || bytes.length === 0) {
    // Handle empty input gracefully, perhaps returning undefined or throwing.
    // Returning undefined might be safer for some use cases.
    return undefined as T;
  }
  const deserializer = new Deserializer(bytes);
  return deserializer.read() as T;
};

export default {
  byteify: byteify,
  from: from
};