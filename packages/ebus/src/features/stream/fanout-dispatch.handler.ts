import type {
  DispatchContext,
  DispatchHandler,
} from "../dispatch/dispatch.handler.js";

/**
 * Creates a robust multicaster for a source `ReadableStream`.
 *
 * This function sets up a "fan-out" mechanism. It reads from the source stream
 * only once and broadcasts (multicasts) each chunk to multiple consumer streams.
 * The created multicaster correctly handles consumers that subscribe at different
 * times and ensures proper cleanup on completion or cancellation.
 *
 * @param sourceStream The original stream to be multicasted.
 * @param context The dispatch context for deep-cloning each stream chunk.
 * @returns A factory function that creates new multicast proxy streams on demand.
 * @internal
 */
function createMulticaster(
  sourceStream: ReadableStream<any>,
  context: DispatchContext
) {
  const controllers: ReadableStreamDefaultController<any>[] = [];
  let reader: ReadableStreamDefaultReader<any> | null = null;

  type MulticasterState = "idle" | "pulling" | "closed" | "errored";
  let state: MulticasterState = "idle";
  let finalError: any = null; // Stores the error if the source fails or is cancelled.

  /**
   * The main loop that pulls from the source and broadcasts to all active consumers.
   */
  async function pullFromSource() {
    // Ensure this loop only runs when it should.
    if (state !== "pulling") return;

    try {
      while (state === "pulling") {
        const { done, value: originalChunk } = await reader!.read();

        if (done) {
          state = "closed";
          controllers.forEach((c) => c.close());
          controllers.length = 0; // Clear the controllers array.
          break;
        }

        // If there are active consumers, dispatch the chunk to all of them.
        if (controllers.length > 0) {
          const dispatchedChunks = context.dispatch(
            originalChunk,
            controllers.length
          );
          controllers.forEach((controller, i) => {
            try {
              // Each controller gets its own deep-cloned chunk.
              controller.enqueue(dispatchedChunks[i]);
            } catch {
              // This can happen if a consumer stream is closed or errored
              // between the dispatch and enqueue. It's safe to ignore.
            }
          });
        }
      }
    } catch (err) {
      state = "errored";
      finalError = err;
      controllers.forEach((c) => c.error(err));
      controllers.length = 0;
    } finally {
      // Releasing the lock is not strictly necessary here since the stream
      // is fully consumed, but it's good practice.
      reader?.releaseLock();
    }
  }

  /**
   * Called by each new proxy stream when it's created and starts listening.
   */
  function start(controller: ReadableStreamDefaultController<any>) {
    // If the source has already finished, immediately close the new consumer.
    if (state === "closed") {
      controller.close();
      return;
    }
    // If the source has already errored, propagate the error.
    if (state === "errored") {
      controller.error(finalError);
      return;
    }

    controllers.push(controller);

    // If this is the very first consumer, kick off the reading process.
    if (state === "idle") {
      state = "pulling";
      reader = sourceStream.getReader();
      pullFromSource();
    }
  }

  /**
   * Called if any consumer cancels their stream.
   * The policy is that one cancellation aborts the entire multicast operation.
   */
  function cancel(reason?: any) {
    if (state === "closed" || state === "errored") return;

    state = "errored";
    finalError = reason || new Error("Stream was cancelled by a consumer.");

    // Abort the source stream.
    sourceStream.cancel(finalError).catch(() => {});

    // Propagate the cancellation error to all other active consumers.
    controllers.forEach((c) => c.error(finalError));
    controllers.length = 0;
  }

  // Return the factory function to create a proxy stream for this multicast session.
  return function createMulticastProxyStream(): ReadableStream {
    return new ReadableStream({ start, cancel });
  };
}

/**
 * A `DispatchHandler` for `ReadableStream` that implements multicasting (fan-out).
 *
 * When a `ReadableStream` is dispatched, this handler creates a new multicaster
 * for it. Each of the `count` returned streams is a proxy that will receive a
 * deep-cloned copy of the data chunks from the original stream.
 */
export const ReadableStreamDispatchHandler: DispatchHandler<ReadableStream> = {
  canHandle(value: unknown): value is ReadableStream {
    return value instanceof ReadableStream;
  },

  dispatch(
    originalStream: ReadableStream,
    count: number,
    context: DispatchContext
  ): ReadableStream[] {
    if (count <= 0) return [];

    // A new, independent multicaster is created for each dispatch operation.
    const createProxy = createMulticaster(originalStream, context);

    const results: ReadableStream[] = [];
    for (let i = 0; i < count; i++) {
      results.push(createProxy());
    }
    return results;
  },
};
