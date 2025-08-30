import { v4 as uuid } from "uuid";
import type { TypeHandler } from "../serialization/type.handler";
import type { StreamContribution } from "./stream.feature";
import type { Placeholder } from "../../types/protocol";

/** The placeholder for a serialized `ReadableStream`. */
export interface ReadableStreamPlaceholder extends Placeholder {
  _erpc_type: "stream_readable";
  handshakeId: string;
}

/** The placeholder for a serialized `WritableStream`. */
export interface WritableStreamPlaceholder extends Placeholder {
  _erpc_type: "stream_writable";
  handshakeId: string;
}

function isReadableStream(obj: any): obj is ReadableStream {
  return obj instanceof ReadableStream;
}

function isWritableStream(obj: any): obj is WritableStream {
  return obj instanceof WritableStream;
}

/**
 * Creates the `TypeHandler` for WHATWG Streams.
 *
 * This handler integrates stream transport with the serialization system.
 * It transforms local streams into placeholders for transmission and reconstructs
 * them on the receiving end as corresponding proxy streams.
 *
 * @param capability The capabilities provided by the `StreamFeature`.
 * @returns A `TypeHandler` instance for processing streams.
 * @internal
 */
export function createStreamHandler(
  capability: StreamContribution
): TypeHandler<
  ReadableStream | WritableStream,
  ReadableStreamPlaceholder | WritableStreamPlaceholder
> {
  return {
    name: ["stream_readable", "stream_writable"],

    canHandle(value: unknown): value is ReadableStream | WritableStream {
      return isReadableStream(value) || isWritableStream(value);
    },

    serialize(stream) {
      const handshakeId = uuid();

      if (isReadableStream(stream)) {
        // To serialize a ReadableStream (we can read from it), we create a
        // "Push Writer" on our side. This writer will pull data from our local
        // stream and push it to the remote peer.
        const pushWriter = capability.createPushWriter(handshakeId);

        // Connect the local stream to the writer.
        stream.pipeTo(pushWriter).catch((err) => {
          console.error(
            `[erpc stream handler] Error piping local ReadableStream to PushWriter (handshakeId: ${handshakeId}):`,
            err
          );
        });

        // We send a placeholder telling the remote peer that a readable stream is available for them.
        return {
          _erpc_type: "stream_readable",
          handshakeId,
        };
      }

      if (isWritableStream(stream)) {
        // To serialize a WritableStream (we can write to it), we create a
        // "Pull Reader" on our side. This reader will receive data from the
        // remote peer and pull it into our local stream.
        const pullReader = capability.openPullReader(handshakeId);

        // Connect the reader to our local writable stream.
        pullReader.pipeTo(stream).catch((err: unknown) => {
          console.error(
            `[erpc stream handler] Error piping PullReader to local WritableStream (handshakeId: ${handshakeId}):`,
            err
          );
        });

        // We send a placeholder telling the remote peer that a writable stream is available for them.
        return {
          _erpc_type: "stream_writable",
          handshakeId,
        };
      }

      throw new Error("Invalid object passed to stream handler.");
    },

    deserialize(placeholder) {
      // The deserialization logic is the mirror image of serialization.
      switch (placeholder._erpc_type) {
        // The remote peer sent a readable stream, so we create a reader to receive data.
        case "stream_readable":
          return capability.openPullReader(placeholder.handshakeId);

        // The remote peer sent a writable stream, so we create a writer to send data.
        case "stream_writable":
          return capability.createPushWriter(placeholder.handshakeId);
      }
    },
  };
}
