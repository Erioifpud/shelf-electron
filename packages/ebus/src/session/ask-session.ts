import type { Transferable } from "@eleplug/erpc";
import type { Result } from "../types/common.js";
import { ok, err } from "../types/common.js";
import { deserializeError } from "../types/errors.js";
import type {
  ProtocolMessage,
  RpcAckFinPayload,
  RpcAckResultPayload,
  P2PMessage,
} from "../types/protocol.js";
import type { ISession, MessageSource } from "./session.interface.js";

/**
 * Defines the dependencies (`AskSession`'s "world view") required for it to
 * send messages back into the EBUS network.
 * @internal
 */
export interface AskSessionCapability {
  sendTo(source: MessageSource, message: P2PMessage): void;
}

/**
 * An internal handle to control an `AsyncIterable`.
 * @internal
 */
interface AsyncIteratorController<T> {
  yield(value: T): void;
  close(): void;
  error(err: any): void;
}

/**
 * Tracks the state of a single downstream branch (parent or child bus) for an `ask` call.
 * @internal
 */
type DownstreamAskState = {
  /** 'pending' until a final 'ack_fin' is received from this branch. */
  status: "pending" | "fin_received";
  /** The total number of results expected from this branch, as reported by `ack_fin`. */
  expectedResults: number;
  /** The number of results received so far from this branch. */
  receivedResults: number;
};

/**
 * Manages the complex lifecycle of a single broadcast `ask`/`all` call.
 *
 * Its responsibilities include:
 * - Tracking the progress of results from all downstream branches (parent/child buses)
 *   and local subscribers.
 * - Aggregating results and forwarding them to the original caller (if remote)
 *   or yielding them via an `AsyncIterable` (if local).
 * - Detecting when all branches have completed and terminating the session.
 */
export class AskSession implements ISession {
  public readonly sessionId: string;

  private readonly source: MessageSource;
  private readonly capability: AskSessionCapability;

  /** State for remote downstream branches (parent/children). Key is a stringified `MessageSource`. */
  private readonly downstreamState = new Map<string, DownstreamAskState>();
  /** State for local node deliveries. */
  private readonly localDelivery: DownstreamAskState = {
    status: "pending",
    expectedResults: 0,
    receivedResults: 0,
  };

  private readonly iteratorController: AsyncIteratorController<
    Result<Transferable>
  >;
  private readonly asyncIterable: AsyncIterable<Result<Transferable>>;

  constructor(
    sessionId: string,
    source: MessageSource,
    initialDownstreams: MessageSource[],
    capability: AskSessionCapability
  ) {
    this.sessionId = sessionId;
    this.source = source;
    this.capability = capability;

    initialDownstreams.forEach((ds) => {
      if (ds.type !== "local") {
        this.downstreamState.set(JSON.stringify(ds), {
          status: "pending",
          expectedResults: 0,
          receivedResults: 0,
        });
      }
    });

    // The async iterator is only created and used if the call originated locally.
    if (this.source.type === "local") {
      const { controller, iterable } = this.createAsyncIterator();
      this.iteratorController = controller;
      this.asyncIterable = iterable;
    } else {
      // Create a no-op controller/iterable for remote-originated sessions.
      this.iteratorController = {
        yield: () => {},
        close: () => {},
        error: () => {},
      };
      this.asyncIterable = { [Symbol.asyncIterator]: async function* () {} };
    }
  }

  /**
   * Returns the async iterable for consuming results if the call originated locally.
   */
  public getAsyncIterable(): AsyncIterable<Result<Transferable>> {
    return this.asyncIterable;
  }

  public update(message: ProtocolMessage, source: MessageSource): void {
    if (message.kind !== "p2p") return;

    switch (message.payload.type) {
      case "ack_result":
        this.handleAckResult(message.payload, source);
        break;
      case "ack_fin":
        this.handleAckFin(message.payload, source);
        break;
    }
  }

  /** Called by `PubSubHandlerFeature` when a result from a local subscriber is ready. */
  public handleLocalResult(payload: RpcAckResultPayload): void {
    this.localDelivery.receivedResults++;
    this.processResult(payload);
    this.checkCompletion();
  }

  /** Called by `PubSubHandlerFeature` when it knows how many local subscribers were targeted. */
  public handleLocalDeliveryFin(totalLocalTargets: number): void {
    this.localDelivery.status = "fin_received";
    this.localDelivery.expectedResults = totalLocalTargets;
    this.checkCompletion();
  }

  public handleDownstreamDisconnect(source: MessageSource): void {
    const sourceKey = JSON.stringify(source);
    if (this.downstreamState.has(sourceKey)) {
      // Treat a disconnect as a premature 'fin' with zero results.
      this.handleAckFin(
        { type: "ack_fin", callId: this.sessionId, totalResults: 0 },
        source
      );
    }
  }

  public terminate(error?: Error): void {
    if (error) {
      this.iteratorController.error(error);
    } else {
      this.iteratorController.close();
    }
  }

  /**
   * Creates a robust, pull-based async iterator using a producer-consumer pattern.
   */
  private createAsyncIterator(): {
    controller: AsyncIteratorController<Result<Transferable>>;
    iterable: AsyncIterable<Result<Transferable>>;
  } {
    const valueQueue: Result<Transferable>[] = [];
    const waiterQueue: {
      resolve: (res: IteratorResult<Result<Transferable>>) => void;
      reject: (err: any) => void;
    }[] = [];
    let done = false;
    let error: any = null;

    const controller: AsyncIteratorController<Result<Transferable>> = {
      yield: (value) => {
        if (done) return;
        if (waiterQueue.length > 0) {
          waiterQueue.shift()!.resolve({ value, done: false });
        } else {
          valueQueue.push(value);
        }
      },
      close: () => {
        if (done) return;
        done = true;
        waiterQueue.forEach((w) => w.resolve({ value: undefined, done: true }));
        waiterQueue.length = 0;
      },
      error: (err) => {
        if (done) return;
        done = true;
        error = err;
        waiterQueue.forEach((w) => w.reject(err));
        waiterQueue.length = 0;
      },
    };

    const iterable: AsyncIterable<Result<Transferable>> = {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          if (error) throw error;
          if (valueQueue.length > 0)
            return { value: valueQueue.shift()!, done: false };
          if (done) return { value: undefined, done: true };
          return new Promise((resolve, reject) => {
            waiterQueue.push({ resolve, reject });
          });
        },
        return: async () => {
          this.terminate(
            new Error("AsyncIterator was manually closed by consumer.")
          );
          return { done: true, value: undefined };
        },
      }),
    };

    return { controller, iterable };
  }

  /**
   * Either yields a result to the local iterator or forwards it upstream.
   */
  private processResult(payload: RpcAckResultPayload): void {
    if (this.source.type === "local") {
      const result: Result<Transferable> = payload.result.success
        ? ok(payload.result.data)
        : err(deserializeError(payload.result.error));
      this.iteratorController.yield(result);
    } else {
      const responseMessage: P2PMessage = {
        kind: "p2p",
        sourceId: payload.sourceId, // Preserve the original result source
        destinationId: "upstream", // A conceptual target
        payload: payload,
      };
      this.capability.sendTo(this.source, responseMessage);
    }
  }

  private handleAckResult(
    payload: RpcAckResultPayload,
    source: MessageSource
  ): void {
    const state = this.downstreamState.get(JSON.stringify(source));
    if (state) {
      state.receivedResults++;
    }
    this.processResult(payload);
    this.checkCompletion();
  }

  private handleAckFin(payload: RpcAckFinPayload, source: MessageSource): void {
    const state = this.downstreamState.get(JSON.stringify(source));
    if (state) {
      state.status = "fin_received";
      state.expectedResults = payload.totalResults;
    }
    this.checkCompletion();
  }

  /**
   * Checks if all local and remote branches have finished sending their results.
   * If so, terminates the session.
   */
  private checkCompletion(): void {
    const isLocalDone =
      this.localDelivery.status === "fin_received" &&
      this.localDelivery.receivedResults >= this.localDelivery.expectedResults;

    const areDownstreamsDone = Array.from(this.downstreamState.values()).every(
      (state) =>
        state.status === "fin_received" &&
        state.receivedResults >= state.expectedResults
    );

    if (isLocalDone && areDownstreamsDone) {
      // If the call originated remotely, we must send a final 'fin' message upstream.
      if (this.source.type !== "local") {
        const totalResults =
          this.localDelivery.expectedResults +
          Array.from(this.downstreamState.values()).reduce(
            (sum, s) => sum + s.expectedResults,
            0
          );

        const finPayload: RpcAckFinPayload = {
          type: "ack_fin",
          callId: this.sessionId,
          totalResults,
        };
        const finMessage: P2PMessage = {
          kind: "p2p",
          sourceId: "ebus-system", // System-generated message
          destinationId: "upstream",
          payload: finPayload,
        };
        this.capability.sendTo(this.source, finMessage);
      }

      // This self-terminates the session, which will also clean it up
      // from the SessionManager.
      this.terminate();
    }
  }
}
