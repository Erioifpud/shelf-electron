/**
 * Serializes a JavaScript value into a Uint8Array using a custom binary protocol.
 * @param value The JavaScript value to serialize.
 * @returns A Uint8Array representing the serialized data.
 */
declare const byteify: (value: any) => Uint8Array;
/**
 * Deserializes a Uint8Array back into a JavaScript value using a custom binary protocol.
 * @template T The expected type of the deserialized object.
 * @param bytes The Uint8Array to deserialize.
 * @returns The deserialized JavaScript value, cast to type T.
 */
declare const from: <T = unknown>(bytes: Uint8Array) => T;
declare const _default: {
    byteify: (value: any) => Uint8Array;
    from: <T = unknown>(bytes: Uint8Array) => T;
};

export { byteify, _default as default, from };
