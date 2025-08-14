import {
  type Api,
  type Client,
  type Feature,
  type TransferableArray,
  type Transferable,
} from "@eleplug/erpc";
import type {
  NodeOptions,
  NodeId,
  Topic,
  SubscriptionHandle,
  ConsumerFactory,
  ApiFactory,
  BroadcastableArray,
} from "../../types/common.js";
import type { LocalNodeContribution } from "../local/local-node-manager.feature.js";
import type { P2PContribution } from "../p2p/p2p-handler.feature.js";
import type { PubSubContribution } from "../pubsub/pubsub-handler.feature.js";
import type { RoutingContribution } from "../route/routing.feature.js";
import { Node } from "../../api/node.js";
import type { BridgeConnectionContribution } from "../bridge/bridge-manager.feature.js";

/**
 * The user-facing, top-level API for an EBUS instance, contributed by `ApiFeature`.
 */
export interface EbusApi {
  /**
   * Creates and registers a new logical node on this EBUS instance.
   * @param options Configuration for the new node, including its ID and optional P2P API.
   * @returns A promise that resolves to a `Node` instance, the main handle for
   *          interacting with the EBUS network.
   */
  join<TApi extends Api<TransferableArray, Transferable> = any>(
    options: NodeOptions<TApi>
  ): Promise<Node<TApi>>;

  /**
   * An internal method used by `node.connectTo()` to create a P2P client.
   * @internal
   */
  connectTo<TApi extends Api<TransferableArray, Transferable>>(
    sourceNodeId: NodeId,
    targetNodeId: NodeId
  ): Promise<Client<TApi>>;
}

/** Dependencies required by the `ApiFeature`. */
type ApiRequires = LocalNodeContribution &
  P2PContribution &
  PubSubContribution &
  RoutingContribution &
  BridgeConnectionContribution;

/**
 * A feature that acts as a "facade," composing the low-level capabilities of
 * other features into the final, user-friendly `EbusApi` (`join`, etc.) and the
 * `Node` class.
 */
export class ApiFeature implements Feature<EbusApi, ApiRequires> {
  private capability!: ApiRequires;

  public init(capability: ApiRequires): void {
    this.capability = capability;
  }

  public contribute(): EbusApi {
    return {
      join: this.join.bind(this),
      connectTo: this.connectTo.bind(this),
    };
  }

  public close(): void {
    /* This feature is stateless. */
  }

  public async join<TApi extends Api<TransferableArray, Transferable>>(
    options: NodeOptions<TApi>
  ): Promise<Node<TApi>> {
    await this.capability.registerNode(options);
    await this.capability.announceNode(options.id, true);

    // The Node class is instantiated with callbacks that delegate to the
    // underlying feature implementations.
    return new Node<TApi>(options.id, this, {
      setApi: (factory) => this.capability.updateNodeApi(options.id, factory),
      subscribe: (topic, factory) => this.subscribe(options.id, topic, factory),
      emiter: (pubOptions) => this.capability.createPublisher(pubOptions),
      closeNode: () => this.closeNode(options.id),
    });
  }

  /** The implementation for `node.close()`. */
  private async closeNode(nodeId: NodeId): Promise<void> {
    if (!this.capability.hasNode(nodeId)) {
      console.warn(
        `[API] Attempted to close a non-local node ('${nodeId}'). Ignoring.`
      );
      return;
    }

    // 1. Announce that the node and its subscriptions are going offline.
    const topics = this.capability.getTopicsForNode(nodeId);
    const announcements = [
      ...topics.map((topic) =>
        this.capability.updateLocalSubscription(nodeId, topic, false)
      ),
      this.capability.announceNode(nodeId, false),
    ];
    await Promise.allSettled(announcements);

    // 2. Mark the node as closing to reject new incoming calls immediately.
    await this.capability.markAsClosing(nodeId);

    // 3. Remove the node from the local manager.
    this.capability.removeNode(nodeId);
  }

  public async connectTo<TApi extends Api<TransferableArray, Transferable>>(
    sourceNodeId: NodeId,
    targetNodeId: NodeId
  ): Promise<Client<TApi>> {
    return this.capability.createP2PClient<TApi>(sourceNodeId, targetNodeId);
  }

  private async subscribe(
    nodeId: NodeId,
    topic: Topic,
    consumerFactory: ConsumerFactory<any>
  ): Promise<SubscriptionHandle> {
    await this.capability.addSubscription(nodeId, topic, consumerFactory);
    await this.capability.updateLocalSubscription(nodeId, topic, true);

    return {
      cancel: async () => {
        // To cancel, first announce the state change, then remove locally.
        await this.capability.updateLocalSubscription(nodeId, topic, false);
        this.capability.removeSubscription(nodeId, topic);
      },
    };
  }
}
