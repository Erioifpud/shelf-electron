import type { Link, MultiplexedPacket } from "@eleplug/muxen";
import { AsyncEventEmitter, type MaybePromise } from "@eleplug/transport";

/**
 * Internal events for the MemoryLink.
 * @internal
 */
type LinkEvents = {
  message: (message: MultiplexedPacket) => MaybePromise<void>;
  close: (reason?: Error) => void;
};

/**
 * An in-memory implementation of the `Link` interface from `@eleplug/muxen`.
 * It simulates a raw, message-based, full-duplex connection by directly
 * passing messages between two linked instances.
 * @internal
 */
class MemoryLink implements Link {
  private readonly events = new AsyncEventEmitter<LinkEvents>();
  private _isClosed = false;
  private remote!: MemoryLink;

  /** Links this instance to its remote peer. */
  public _link(remote: MemoryLink): void {
    this.remote = remote;
  }

  /** Receives a message from the linked peer. */
  public _receiveMessage(message: MultiplexedPacket): void {
    if (this._isClosed) return;
    this.events.emitAsync("message", message).catch((err) => {
      this._destroy(err instanceof Error ? err : new Error(String(err)));
    });
  }

  /** Central, idempotent cleanup logic for the link. */
  public _destroy(reason?: Error): void {
    if (this._isClosed) return;
    this._isClosed = true;
    this.events.emit("close", reason);
    this.events.removeAllListeners();
  }

  public onMessage(
    handler: (message: MultiplexedPacket) => MaybePromise<void>
  ): void {
    if (this._isClosed) return;
    // Enforce a single-listener, replacement semantic.
    const existing = this.events.listeners("message")[0];
    if (existing) this.events.off("message", existing as any);
    this.events.on("message", handler);
  }

  public onClose(handler: (reason?: Error) => void): void {
    this.events.on("close", handler);
  }

  public sendMessage(message: MultiplexedPacket): Promise<void> {
    if (this._isClosed) {
      return Promise.reject(new Error("Link is closed."));
    }

    // Use queueMicrotask to simulate the async nature of a real network
    // and avoid synchronous, re-entrant calls.
    queueMicrotask(() => {
      if (!this.remote._isClosed) {
        this.remote._receiveMessage(message);
      }
    });

    return Promise.resolve();
  }

  public abort(reason: Error): Promise<void> {
    if (this._isClosed) return Promise.resolve();
    // Asynchronously destroy both ends of the link.
    queueMicrotask(() => {
      if (!this.remote._isClosed) {
        this.remote._destroy(reason);
      }
      this._destroy(reason);
    });
    return Promise.resolve();
  }

  public close(): Promise<void> {
    if (this._isClosed) return Promise.resolve();
    queueMicrotask(() => {
      if (!this.remote._isClosed) {
        this.remote._destroy();
      }
      this._destroy();
    });
    return Promise.resolve();
  }
}

/**
 * A utility that creates a pair of linked `MemoryLink` instances, ready to be
 * used by `createDuplexTransport` to form a client and server transport for
 * in-process testing.
 */
export class MemoryConnector {
  /** The `Link` instance representing the client side of the connection. */
  public readonly client: Link;
  /** The `Link` instance representing the server side of the connection. */
  public readonly server: Link;

  constructor() {
    const clientLink = new MemoryLink();
    const serverLink = new MemoryLink();

    clientLink._link(serverLink);
    serverLink._link(clientLink);

    this.client = clientLink;
    this.server = serverLink;
  }
}