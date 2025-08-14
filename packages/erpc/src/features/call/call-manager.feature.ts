import { v4 as uuid } from "uuid";
import {
  buildClient,
  type Client,
  type CallProcedure,
} from "../../api/client.js";
import type { Feature } from "../../runtime/framework/feature.js";
import type { ProtocolHandlerContribution } from "../protocol/protocol.handler.feature.js";
import type { SerializationContribution } from "../serialization/serialization.feature.js";
import type { TransportAdapterContribution } from "../transport/transport.adapter.feature.js";
import { ProcedureError } from "../../types/errors.js";
import type { JsonValue } from "packages/transport/dist/index.mjs";
import type {
  RpcRequestMessage,
  RpcResponseMessage,
} from "../../types/protocol.js";

/**
 * The capabilities contributed by the `CallManagerFeature`.
 */
export interface CallManagerContribution {
  /** The fully typed, user-facing eRPC client proxy. */
  readonly procedure: Client<any>;
  /**
   * Sends an 'ask' request and tracks it for a response.
   * @internal Used by features like Pinning that need to make RPC calls.
   */
  trackAsk: (
    path: string,
    args: any[],
    meta?: JsonValue[],
    kind?: string
  ) => Promise<any>;
  /**
   * Sends a 'tell' (fire-and-forget) notification.
   * @internal
   */
  sendTell: (path: string, args: any[], meta?: JsonValue[]) => Promise<void>;
}

type CallManagerRequires = ProtocolHandlerContribution &
  SerializationContribution &
  TransportAdapterContribution;

/**
 * A feature that manages outgoing RPC calls from the client side.
 *
 * It is responsible for:
 * - Building the user-facing client proxy.
 * - Serializing call arguments and constructing request messages.
 * - Sending requests over the transport.
 * - Tracking pending 'ask' calls and matching them with incoming responses.
 * - Handling connection closure by rejecting all pending calls.
 */
export class CallManagerFeature
  implements Feature<CallManagerContribution, CallManagerRequires>
{
  private pending = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason?: any) => void }
  >();
  private isDestroyed = false;
  private capability!: CallManagerRequires;

  public contribute(): CallManagerContribution {
    const client = buildClient(
      this.callProcedure.bind(this) as CallProcedure<any, any>
    );
    return {
      procedure: client,
      trackAsk: this.trackAsk.bind(this),
      sendTell: this.sendTell.bind(this),
    };
  }

  public init(capability: CallManagerRequires): void {
    this.capability = capability;

    // Handle incoming RPC responses.
    capability.semanticEmitter.on("response", (message: RpcResponseMessage) => {
      this.handleResponse(message);
    });

    // Handle transport closure.
    capability.rawEmitter.on("close", (error) => {
      this.handleClose(error);
    });
  }

  /**
   * The callback provided to `buildClient`, routing proxy calls to the appropriate sender method.
   */
  private callProcedure(
    path: string,
    action: "ask" | "tell",
    args: any[],
    meta?: JsonValue[]
  ): Promise<any> | Promise<void> {
    if (this.isDestroyed) {
      return Promise.reject(
        new ProcedureError("Connection is closed, cannot make new calls.")
      );
    }
    return action === "tell"
      ? this.sendTell(path, args, meta)
      : this.trackAsk(path, args, meta);
  }

  public trackAsk(
    path: string,
    args: any[],
    meta?: JsonValue[],
    kind: string = "erpc"
  ): Promise<any> {
    if (this.isDestroyed) {
      return Promise.reject(
        new ProcedureError("Client is closed; cannot make new RPC calls.")
      );
    }

    const callId = uuid();
    const { serializer, sendRawMessage } = this.capability;

    const request: RpcRequestMessage = {
      type: "rpc-request",
      kind,
      callId,
      path,
      input: args.map((arg) => serializer.serialize(arg)),
      meta,
    };

    // Create a new promise and store its resolvers in the pending map.
    const promise = new Promise((resolve, reject) => {
      this.pending.set(callId, { resolve, reject });
    });

    // Send the request. If sending fails, reject the stored promise.
    sendRawMessage(request).catch((err) => {
      const pendingPromise = this.pending.get(callId);
      if (pendingPromise) {
        pendingPromise.reject(
          new ProcedureError("Failed to send RPC request.", err)
        );
        this.pending.delete(callId);
      }
    });

    return promise;
  }

  public sendTell(
    path: string,
    args: any[],
    meta?: JsonValue[]
  ): Promise<void> {
    const { serializer, sendRawMessage } = this.capability;
    const message: any = {
      type: "notify",
      path,
      input: args.map((arg) => serializer.serialize(arg)),
      meta,
    };
    return sendRawMessage(message);
  }

  /**
   * Handles an incoming `RpcResponseMessage`.
   */
  private handleResponse(message: RpcResponseMessage) {
    const promise = this.pending.get(message.callId);
    if (promise) {
      this.pending.delete(message.callId);

      // The response 'output' is always deserialized, whether it's a
      // successful result or a serialized error object.
      const deserializedOutput = this.capability.serializer.deserialize(
        message.output
      );

      if (message.success) {
        promise.resolve(deserializedOutput);
      } else {
        // If the call failed, the deserialized output should be an Error.
        const remoteError =
          deserializedOutput instanceof Error
            ? deserializedOutput
            : new Error(String(deserializedOutput));
        promise.reject(new ProcedureError(remoteError.message, remoteError));
      }
    }
  }

  /**
   * Cleans up all pending calls when the connection is terminated.
   */
  public handleClose(error?: Error): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    const destructionError = new ProcedureError(
      "Connection closed, pending call aborted.",
      error
    );
    for (const promise of this.pending.values()) {
      promise.reject(destructionError);
    }
    this.pending.clear();
  }

  public close(_contribution: CallManagerContribution, error?: Error): void {
    this.handleClose(error);
  }
}
