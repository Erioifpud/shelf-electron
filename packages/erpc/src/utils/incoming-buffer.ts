import { circular_buffer } from "circular_buffer_js";
import type { JsonValue } from "packages/transport/dist/index.mjs";

/**
 * An error thrown when an operation is attempted on a closed or destroyed buffer.
 */
export class BufferClosedError extends Error {
  constructor(message: string = "Operation on a closed buffer.") {
    super(message);
    this.name = "BufferClosedError";
  }
}

/** A tuple representing the `resolve` and `reject` functions of a Promise. @internal */
type Resolver<T> = {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
};

/** A resolver for a promise that completes when the buffer is drained. @internal */
type DrainResolver = {
  resolve: () => void;
  reject: (reason?: any) => void;
};

/**
 * A robust, backpressure-aware internal buffer for incoming stream data.
 *
 * It uses a circular buffer to store data and gracefully handles mismatches
 * in speed between the data producer (`push`) and consumer (`pop`). When the
 * buffer is full, producers wait; when it's empty, consumers wait.
 *
 * @internal
 */
export class IncomingBuffer {
  private readonly buf: circular_buffer<JsonValue>;
  private readonly pendingPop: Resolver<JsonValue>[] = [];
  private readonly pendingPush: {
    item: JsonValue;
    resolve: () => void;
    reject: (err: any) => void;
  }[] = [];
  private readonly pendingDrain: DrainResolver[] = [];

  private isFinished = false;
  private closeError: Error | null = null;

  constructor(capacity: number = 256) {
    this.buf = new circular_buffer(capacity);
  }

  /**
   * Pushes an item into the buffer. If the buffer is full, this method returns
   * a promise that resolves when space becomes available.
   * @param item The `JsonValue` to add to the buffer.
   * @returns A promise that resolves when the item has been buffered.
   */
  public push(item: JsonValue): Promise<void> {
    if (this.isFinished || this.closeError) {
      return Promise.reject(
        this.closeError ?? new BufferClosedError("Buffer is closed.")
      );
    }

    // If a consumer is waiting for data, bypass the buffer and hand it over directly.
    if (this.pendingPop.length > 0) {
      const waiter = this.pendingPop.shift()!;
      queueMicrotask(() => waiter.resolve(item));
      return Promise.resolve();
    }

    // If the buffer is full, the producer must wait for a consumer to make space.
    if (this.buf.isFull) {
      return new Promise<void>((resolve, reject) => {
        this.pendingPush.push({ item, resolve, reject });
      });
    }

    this.buf.push(item);
    return Promise.resolve();
  }

  /**
   * Pops an item from the buffer. If the buffer is empty, this method returns
   * a promise that resolves when an item becomes available.
   * @returns A promise that resolves with the next item from the buffer.
   */
  public pop(): Promise<JsonValue> {
    if (this.closeError) {
      return Promise.reject(this.closeError);
    }

    // If there's data in the buffer, return it immediately.
    if (!this.buf.isEmpty) {
      const value = this.buf.pop()!;

      // After consuming, if a producer was waiting for space, wake it up.
      if (this.pendingPush.length > 0) {
        const waiter = this.pendingPush.shift()!;
        this.buf.push(waiter.item);
        queueMicrotask(() => waiter.resolve());
      }

      // Check if this `pop` operation has drained the buffer after it was finished.
      if (this.isFinished && this.buf.isEmpty) {
        this.resolvePendingDrains();
      }

      return Promise.resolve(value);
    }

    // If the stream has finished and the buffer is now empty.
    if (this.isFinished) {
      return Promise.reject(
        new BufferClosedError("Buffer is closed and empty.")
      );
    }

    // If the buffer is empty, the consumer must wait for a producer to push data.
    return new Promise<JsonValue>((resolve, reject) => {
      this.pendingPop.push({ resolve, reject });
    });
  }

  /**
   * Returns a promise that resolves when the buffer is fully drained.
   * The buffer is considered drained when it has been marked as `finished`
   * and all its contents have been `pop`ped.
   */
  public onDrained(): Promise<void> {
    if (this.isFinished && this.buf.isEmpty) {
      return Promise.resolve();
    }
    if (this.closeError) {
      return Promise.reject(this.closeError);
    }
    return new Promise((resolve, reject) => {
      this.pendingDrain.push({ resolve, reject });
    });
  }

  /**
   * Signals that no more items will be pushed to the buffer (graceful close).
   * Any pending `pop` calls will be rejected once the existing buffer is empty.
   */
  public finish(): void {
    if (this.isFinished || this.closeError) return;
    this.isFinished = true;

    // If the buffer is already empty, resolve any drain promises immediately.
    if (this.buf.isEmpty) {
      this.resolvePendingDrains();
    }

    // Reject any currently waiting consumers, as no more data will arrive.
    const error = new BufferClosedError("Buffer was closed and empty.");
    while (this.pendingPop.length > 0) {
      const waiter = this.pendingPop.shift()!;
      queueMicrotask(() => waiter.reject(error));
    }
  }

  /**
   * Destroys the buffer due to an error (abrupt close).
   * All pending `push` and `pop` calls will be rejected with the provided error.
   * @param err The error that caused the destruction.
   */
  public destroy(err?: any) {
    if (this.closeError) return;
    this.isFinished = true;
    this.closeError =
      err instanceof Error
        ? err
        : new BufferClosedError(err ? String(err) : "Buffer was destroyed.");

    // Reject all pending operations.
    const rejectAll = (queue: { reject: (reason?: any) => void }[]) => {
      while (queue.length > 0) {
        const waiter = queue.shift()!;
        queueMicrotask(() => waiter.reject(this.closeError!));
      }
    };
    rejectAll(this.pendingPop);
    rejectAll(this.pendingPush);
    rejectAll(this.pendingDrain);
  }

  /**
   * Resolves all promises waiting for the buffer to be drained.
   */
  private resolvePendingDrains(): void {
    while (this.pendingDrain.length > 0) {
      const waiter = this.pendingDrain.shift()!;
      queueMicrotask(() => waiter.resolve());
    }
  }
}
