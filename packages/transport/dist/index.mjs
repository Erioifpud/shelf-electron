// src/events.ts
import { EventEmitter } from "tseep";
var AsyncEventEmitter = class extends EventEmitter {
  /**
   * Emits an event and waits for all listeners to complete concurrently.
   * Listeners are executed in parallel via `Promise.all`. This is suitable
   * for I/O-bound tasks that can run simultaneously without interference.
   *
   * @example
   * ```ts
   * emitter.on('data', async (chunk) => await processChunk(chunk));
   * // Waits for all `processChunk` calls to complete in parallel.
   * await emitter.emitAsync('data', 'some-chunk');
   * ```
   *
   * @param event The name of the event to emit.
   * @param args The arguments to pass to the listeners.
   * @returns A promise that resolves when all listeners have completed.
   */
  async emitAsync(event, ...args) {
    const listeners = this.listeners(event);
    await Promise.all(listeners.map((fn) => Promise.resolve(fn(...args))));
  }
  /**
   * Emits an event and waits for each listener to complete serially.
   * Listeners are executed one after another in the order they were registered.
   * This is crucial for tasks that must not overlap.
   *
   * @example
   * ```ts
   * emitter.on('task', async (id) => {
   *   console.log(`Starting task ${id}`);
   *   await longRunningTask(id);
   *   console.log(`Finished task ${id}`);
   * });
   * // Executes the first listener, waits for it to finish, then executes the next.
   * await emitter.emitSerial('task', 1);
   * ```
   *
   * @param event The name of the event to emit.
   * @param args The arguments to pass to the listeners.
   * @returns A promise that resolves when the last listener has completed.
   */
  async emitSerial(event, ...args) {
    const listeners = this.listeners(event);
    for (const fn of listeners) {
      await Promise.resolve(fn(...args));
    }
  }
  /** A private promise chain to ensure queued emissions are processed serially. */
  queue = Promise.resolve();
  /**
   * Enqueues an event to be emitted after all previously queued events have
   * been processed. This guarantees that entire `emit` invocations are executed
   * in sequence, preventing race conditions between different event emissions.
   *
   * @remarks
   * While the emission of *separate* events is serialized, the listeners for a
   * *single* queued event are still run concurrently via `emitAsync`.
   *
   * @example
   * ```ts
   * // The 'update' for data2 will not start until all listeners
   * // for the 'update' of data1 have completed.
   * emitter.emitQueued('update', data1);
   * emitter.emitQueued('update', data2);
   * ```
   *
   * @param event The name of the event to emit.
   * @param args The arguments to pass to the listeners.
   * @returns A promise that resolves when this specific queued event has been
   * fully handled by all its listeners.
   */
  emitQueued(event, ...args) {
    const task = () => this.emitAsync(event, ...args);
    this.queue = this.queue.then(task, task);
    return this.queue;
  }
};
export {
  AsyncEventEmitter
};
