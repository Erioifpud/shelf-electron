import { v4 as uuid } from "uuid";
import {
  type Api,
  type Client,
  type Feature,
  type Transferable,
  type TransferableArray,
  buildClient,
  type CallProcedure,
} from "@eleplug/erpc";
import type { NodeId } from "../../types/common.js";
import type {
  P2PMessage,
  P2PAskPayload,
  P2PTellPayload,
  RpcAckResultPayload,
} from "../../types/protocol.js";
import type { BridgeConnectionContribution } from "../bridge/bridge-manager.feature.js";
import type { LocalNodeContribution } from "../local/local-node-manager.feature.js";
import type { RoutingContribution } from "../route/routing.feature.js";
import {
  deserializeError,
  NodeNotFoundError,
  serializeError,
} from "../../types/errors.js";
import type { PubSubContribution } from "../pubsub/pubsub-handler.feature.js";

/**
 * The capabilities contributed by the `P2PHandlerFeature`.
 */
export interface P2PContribution {
  /** Creates a typed erpc client for P2P communication with a target node. */
  createP2PClient<TApi extends Api<TransferableArray, Transferable>>(
    sourceNodeId: NodeId,
    targetNodeId: NodeId
  ): Client<TApi>;
  /** The main entry point for routing any P2P message. */
  routeP2PMessage(message: P2PMessage): void;
}

type P2PRequires = RoutingContribution &
  BridgeConnectionContribution &
  LocalNodeContribution &
  PubSubContribution;

/**
 * A feature that handles all point-to-point (P2P) communication.
 *
 * Its responsibilities include:
 * - Creating client proxies for initiating P2P calls.
 * - Routing outgoing P2P messages (requests and responses) based on the routing table.
 * - Dispatching incoming messages to the `LocalNodeManager` for execution if the
 *   destination is local.
 * - Handling responses for P2P calls, either by resolving pending promises or by
 *   delegating them to the `PubSub` session manager if they are part of a
 *   broadcast `ask` session.
 */
export class P2PHandlerFeature
  implements Feature<P2PContribution, P2PRequires>
{
  private capability!: P2PRequires;
  private readonly pendingCalls = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason?: any) => void }
  >();

  public init(capability: P2PRequires): void {
    this.capability = capability;
    capability.busEvents.on("message", ({ source, message }) => {
      if (message.kind === "p2p") {
        // Intercept responses ('ack') and check if they belong to a Pub/Sub session.
        if (
          message.payload.type === "ack_result" ||
          message.payload.type === "ack_fin"
        ) {
          if (this.capability.isManagingSession(message.payload.callId)) {
            this.capability.delegateMessageToSession(message, source);
            return; // The session manager will handle this message.
          }
        }

        // If not part of a session, or if it's a request, handle as normal P2P.
        this.routeP2PMessage(message);
      }
    });
  }

  public contribute(): P2PContribution {
    return {
      createP2PClient: this.createP2PClient.bind(this),
      routeP2PMessage: this.routeP2PMessage.bind(this),
    };
  }

  public close(): void {
    const error = new Error("EBUS instance is closing.");
    this.pendingCalls.forEach((p) => p.reject(error));
    this.pendingCalls.clear();
  }

  public createP2PClient<TApi extends Api<TransferableArray, Transferable>>(
    sourceNodeId: NodeId,
    targetNodeId: NodeId
  ): Client<TApi> {
    const callProcedure: CallProcedure<any, any> = (path, action, args, meta) => {
      if (action === 'ask') {
        const payload: P2PAskPayload = {
          type: "ask",
          callId: `${sourceNodeId}:${uuid()}`,
          path,
          args,
          meta,
        };
  
        const message: P2PMessage = {
          kind: "p2p",
          sourceId: sourceNodeId,
          destinationId: targetNodeId,
          payload,
        };

        const promise = new Promise<any>((resolve, reject) => {
          this.pendingCalls.set(payload.callId, { resolve, reject });
        });
        this.routeP2PMessage(message);
        return promise;
      } else { // action is 'tell'
        const payload: P2PTellPayload = { 
            type: "tell",
            path,
            args,
            meta
        };

        const message: P2PMessage = {
            kind: "p2p",
            sourceId: sourceNodeId,
            destinationId: targetNodeId,
            payload,
        };

        this.routeP2PMessage(message);
        return Promise.resolve();
      }
    };

    return buildClient<TApi>(callProcedure);
  }

  public async routeP2PMessage(message: P2PMessage): Promise<void> {
    const { destinationId, sourceId, payload } = message;
    const nextHop = this.capability.getNextHop(destinationId);

    // Case 1: Destination is a local node.
    if (nextHop?.type === "local") {
      if (payload.type === "ask" || payload.type === "tell") {
        // Execute the procedure locally.
        const result = await this.capability.executeP2PProcedure(
          destinationId,
          sourceId,
          payload
        );

        // If it was an 'ask' call, send the result back.
        if (payload.type === "ask" && result) {
          const responsePayload: RpcAckResultPayload = {
            type: "ack_result",
            callId: payload.callId,
            sourceId: destinationId,
            resultSeq: 0,
            result: result.success
              ? { success: true, data: result.data }
              : { success: false, error: serializeError(result.error) },
          };
          const responseMessage: P2PMessage = {
            kind: "p2p",
            sourceId: destinationId,
            destinationId: sourceId,
            payload: responsePayload,
          };
          // Route the response back to the original caller.
          this.routeP2PMessage(responseMessage);
        }
      } else if (payload.type === "ack_result" || payload.type === "ack_fin") {
        // This handles responses for calls initiated by a local client.
        const pending = this.pendingCalls.get(payload.callId);
        if (pending) {
          this.pendingCalls.delete(payload.callId);
          if (payload.type === "ack_result") {
            if (payload.result.success) {
              pending.resolve(payload.result.data);
            } else {
              pending.reject(deserializeError(payload.result.error));
            }
          }
          // 'ack_fin' is only relevant to Pub/Sub sessions and is ignored here.
        }
      }
      return;
    }

    // Case 2: Destination is on an adjacent bus (parent or child).
    if (nextHop) {
      if (nextHop.type === "parent") {
        await this.capability.sendToParent(message);
      } else if (nextHop.type === "child") {
        await this.capability.sendToChild(nextHop.busId, message);
      }
      return;
    }

    // Case 3: No route found.
    if (payload.type === "ask") {
      // If it was an 'ask' call, we must send an error response back.
      const error = new NodeNotFoundError(destinationId);
      const errorResponsePayload: RpcAckResultPayload = {
        type: "ack_result",
        callId: payload.callId,
        sourceId: "ebus-system",
        resultSeq: 0,
        result: { success: false, error: serializeError(error) },
      };
      const responseMessage: P2PMessage = {
        kind: "p2p",
        sourceId: "ebus-system",
        destinationId: sourceId,
        payload: errorResponsePayload,
      };
      this.routeP2PMessage(responseMessage);
    }
    // For 'tell' calls to an unknown destination, the message is simply dropped.
  }
}