import type { Transferable } from "@eleplug/erpc";
import type { DispatchHandler } from "../dispatch/dispatch.handler.js";

/**
 * A `DispatchHandler` for `WritableStream` that implements aggregation (fan-in).
 *
 * When a `WritableStream` is dispatched, this handler creates `count` new proxy
 * (or "contributor") streams. All data written to these contributor streams
 * is funneled into the single, original `WritableStream`.
 *
 * It includes a robust completion handshake: the original stream is only closed
 * after all contributor streams have been closed, or aborted if any one of them aborts.
 */
export const WritableStreamDispatchHandler: DispatchHandler<WritableStream> = {
  canHandle(value: unknown): value is WritableStream {
    return value instanceof WritableStream;
  },

  dispatch(originalStream: WritableStream, count: number): WritableStream[] {
    if (count <= 0) return [];

    // --- Aggregator Shared State ---
    const writer = originalStream.getWriter();
    let activeContributors = count;
    let isTerminated = false;

    // A shared promise that all contributor streams will return on close/abort.
    // This ensures that callers of `contributor.close()` await the final
    // outcome of the entire aggregation.
    let completionPromiseController: {
      resolve: () => void;
      reject: (reason: any) => void;
    };
    const completionPromise = new Promise<void>((resolve, reject) => {
      completionPromiseController = { resolve, reject };
    });

    /** An idempotent function to terminate the entire aggregation process. */
    const terminate = async (error?: any) => {
      if (isTerminated) return;
      isTerminated = true;

      try {
        if (error) {
          await writer.abort(error);
          completionPromiseController.reject(error);
        } else {
          await writer.close();
          completionPromiseController.resolve();
        }
      } catch (e) {
        // If the final close/abort itself fails, reject the shared promise.
        completionPromiseController.reject(e);
      }
    };

    const contributorStreams: WritableStream[] = [];
    for (let i = 0; i < count; i++) {
      const stream = new WritableStream<Transferable>({
        async write(chunk) {
          if (isTerminated) {
            throw new Error("Aggregation stream has been terminated.");
          }
          try {
            // All writes are proxied to the single, original writer.
            await writer.write(chunk);
          } catch (e) {
            // If any write fails, terminate the entire operation.
            await terminate(e);
            throw e; // Re-throw the error to the current writer.
          }
        },

        close() {
          if (!isTerminated) {
            activeContributors--;
            // The last contributor to close triggers the final close of the original stream.
            if (activeContributors === 0) {
              terminate();
            }
          }
          // All contributors return the same shared promise.
          return completionPromise;
        },

        abort(reason) {
          if (!isTerminated) {
            // The first contributor to abort terminates the entire operation with an error.
            terminate(reason);
          }
          return completionPromise;
        },
      });
      contributorStreams.push(stream);
    }

    return contributorStreams;
  },
};
