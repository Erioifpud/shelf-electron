/**
 * @fileoverview
 * This feature handles all point-to-point (P2P) communication within the EBUS
 * system. It is responsible for creating type-safe client proxies for direct
 * node-to-node interaction, routing P2P messages through the bus network,
 * and managing the lifecycle of request-response calls.
 */

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
  GroupPermissionError,
  serializeError,
} from "../../types/errors.js";
import type { PubSubContribution } from "../pubsub/pubsub-handler.feature.js";

/**
 * The capabilities contributed by the P2PHandlerFeature to the EBUS core.
 */
export interface P2PContribution {
  /**
   * Creates a typed erpc client for P2P communication with a target node.
   * This method performs "fail-fast" validation, ensuring the target node is
   * both reachable and accessible before returning a client.
   */
  createP2PClient<TApi extends Api<TransferableArray, Transferable>>(
    sourceNodeId: NodeId,
    targetNodeId: NodeId
  ): Promise<Client<TApi>>;
  /**
   * The main entry point for routing any P2P message throughout the bus network.
   * @internal
   */
  routeP2PMessage(message: P2PMessage): void;
}

type P2PRequires = RoutingContribution &
  BridgeConnectionContribution &
  LocalNodeContribution &
  PubSubContribution;

/**
 * @class P2PHandlerFeature
 * Orchestrates all direct node-to-node communication. It provides the user-facing
 * `node.connectTo()` functionality by creating client proxies, and handles the
 * underlying routing of P2P messages (both requests and responses) to their
 * final destination, whether local or on an adjacent bus.
 */
export class P2PHandlerFeature
  implements Feature<P2PContribution, P2PRequires>
{
  private capability!: P2PRequires;
  /**
   * @internal
   * A map of pending 'ask' calls initiated by local nodes, awaiting responses.
   */
  private readonly pendingCalls = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason?: any) => void }
  >();

  public init(capability: P2PRequires): void {
    this.capability = capability;
    capability.busEvents.on("message", ({ source, message }) => {
      if (message.kind === "p2p") {
        // If a response is part of a Pub/Sub session, delegate it instead of handling here.
        if (
          (message.payload.type === "ack_result" ||
            message.payload.type === "ack_fin") &&
          this.capability.isManagingSession(message.payload.callId)
        ) {
          this.capability.delegateMessageToSession(message, source);
          return;
        }
        // Handle all other P2P messages.
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

  /**
   * Creates a client proxy for a target node after performing validations.
   * @description
   * This is the implementation for `node.connectTo()`. It provides a "fail-fast"
   * mechanism by performing two critical checks before returning a client proxy:
   * 1. Route Existence Check: Verifies the `targetNodeId` is known to the network.
   * 2. Group Permission Check: Verifies the source and target nodes share a common group.
   * @param sourceNodeId - The ID of the node initiating the connection.
   * @param targetNodeId - The ID of the node to connect to.
   * @returns A promise that resolves with a type-safe `Client<TApi>` proxy.
   * @throws {NodeNotFoundError} If no route to the `targetNodeId` can be found.
   * @throws {GroupPermissionError} If the source and target nodes have no common groups.
   */
  public async createP2PClient<
    TApi extends Api<TransferableArray, Transferable>,
  >(sourceNodeId: NodeId, targetNodeId: NodeId): Promise<Client<TApi>> {
    // 1. FAIL FAST - Route Existence Check
    if (this.capability.getNextHop(targetNodeId) === null) {
      throw new NodeNotFoundError(targetNodeId);
    }

    // 2. FAIL FAST - Group Permission Check
    const sourceGroups = this.capability.getLocalNodeGroups(sourceNodeId);
    const targetGroups = this.capability.getNodeGroups(targetNodeId);

    if (sourceGroups && targetGroups) {
      const sourceGroupArray = Array.from(sourceGroups);
      const hasCommonGroup = sourceGroupArray.some((g) => targetGroups.has(g));
      if (!hasCommonGroup) {
        throw new GroupPermissionError(
          `Node '${sourceNodeId}' (groups: [${sourceGroupArray.join(", ")}]) does not have permission to connect to node '${targetNodeId}' (groups: [${Array.from(targetGroups).join(", ")}]).`
        );
      }
    } // Note: If groups are somehow undefined here, we optimistically proceed,
    // letting the final execution-time check in LocalNodeManager be the ultimate authority.

    const callProcedure: CallProcedure<any, any> = (
      path,
      action,
      args,
      meta
    ) => {
      const groups = Array.from(
        this.capability.getLocalNodeGroups(sourceNodeId) ?? [""]
      );

      if (action === "ask") {
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
          sourceGroups: groups,
          destinationId: targetNodeId,
          payload,
        };

        const promise = new Promise<any>((resolve, reject) => {
          this.pendingCalls.set(payload.callId, { resolve, reject });
        });
        this.routeP2PMessage(message);
        return promise;
      } else {
        // action is 'tell'
        const payload: P2PTellPayload = { type: "tell", path, args, meta };
        const message: P2PMessage = {
          kind: "p2p",
          sourceId: sourceNodeId,
          sourceGroups: groups,
          destinationId: targetNodeId,
          payload,
        };
        this.routeP2PMessage(message);
        return Promise.resolve();
      }
    };

    return buildClient<TApi>(callProcedure);
  }

  /**
   * Routes a P2P message to its destination.
   * @description
   * This is the core runtime router for P2P messages. It determines the next hop
   * from the routing table. If the destination is local, it executes the call.
   * If it's remote, it forwards the message to the appropriate adjacent bus.
   * It also handles routing responses back to their original callers.
   * @param message - The P2P message to route.
   * @internal
   */
  public async routeP2PMessage(message: P2PMessage): Promise<void> {
    const { destinationId, sourceId, payload, sourceGroups } = message;
    const nextHop = this.capability.getNextHop(destinationId);

    // Case 1: Destination is a local node on this bus instance.
    if (nextHop?.type === "local") {
      if (payload.type === "ask" || payload.type === "tell") {
        // Execute the procedure locally. This includes the final permission check.
        const result = await this.capability.executeP2PProcedure(
          destinationId,
          sourceId,
          sourceGroups,
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
            sourceGroups: Array.from(
              this.capability.getLocalNodeGroups(destinationId) ?? [""]
            ),
            destinationId: sourceId,
            payload: responsePayload,
          };
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
        }
      }
      return;
    }

    // Case 2: Destination is on an adjacent bus. Forward the message.
    if (nextHop) {
      if (nextHop.type === "parent") {
        await this.capability.sendToParent(message);
      } else if (nextHop.type === "child") {
        await this.capability.sendToChild(nextHop.busId, message);
      }
      return;
    }

    // Case 3: No route found. Send a NodeNotFoundError response for 'ask' calls.
    if (payload.type === "ask") {
      const error = new NodeNotFoundError(destinationId as string);
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
        sourceGroups: [],
        destinationId: sourceId,
        payload: errorResponsePayload,
      };
      this.routeP2PMessage(responseMessage);
    }
  }
}
