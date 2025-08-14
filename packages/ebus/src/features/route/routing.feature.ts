import { v4 as uuid } from "uuid";
import { type Feature } from "@eleplug/erpc";
import type { BridgeConnectionContribution } from "../bridge/bridge-manager.feature.js";
import type { LocalNodeContribution } from "../local/local-node-manager.feature.js";
import type { ProtocolCoordinatorContribution } from "../protocol/protocol-coordinator.feature.js";
import type { Topic, NodeId, BusId } from "../../types/common.js";
import type { MessageSource } from "../../session/session.interface.js";
import type {
  NodeAnnouncementMessage,
  SubscriptionUpdateMessage,
  ProtocolMessage,
} from "../../types/protocol.js";
import { EbusError, serializeError } from "../../types/errors.js";

/** An internal type representing the next hop for a route. */
type RouteHop =
  | { type: "local" }
  | { type: "parent" }
  | { type: "child"; busId: BusId };

/** The capabilities contributed by the `RoutingFeature`. */
export interface RoutingContribution {
  /** Announces the availability state of a local node to the network. */
  announceNode(nodeId: NodeId, isAvailable: boolean): Promise<void>;

  /** Updates the subscription state for a local node and propagates the change. */
  updateLocalSubscription(
    nodeId: NodeId,
    topic: Topic,
    isSubscribed: boolean
  ): Promise<void>;

  /** Gets the next routing hop for a destination node ID. */
  getNextHop(destination: NodeId): RouteHop | null;

  /** Calculates all downstream branches for a broadcast message. */
  getBroadcastDownstream(topic: Topic, source: MessageSource): MessageSource[];

  /** Gets all local node IDs subscribed to a specific topic. */
  getLocalSubscribers(topic: Topic): NodeId[];
}

type RoutingRequires = BridgeConnectionContribution &
  LocalNodeContribution &
  ProtocolCoordinatorContribution;

/**
 * A feature that manages all P2P and Pub/Sub routing logic.
 *
 * It maintains two key data structures:
 * 1.  A `nodeRoutes` table for unicast (P2P) routing.
 * 2.  Interest tables (`remoteTopicHops`, `localNodeSubscriptions`) for multicast (Pub/Sub) routing.
 *
 * It handles incoming state updates from downstream buses, propagates local state changes
 * upstream reliably, and cleans up routes when connections are dropped.
 */
export class RoutingFeature
  implements Feature<RoutingContribution, RoutingRequires>
{
  // Key: NodeId, Value: The next hop to reach that node.
  private readonly nodeRoutes = new Map<NodeId, RouteHop>();

  // Key: Topic, Value: Set of child BusIds interested in this topic.
  private readonly remoteTopicHops = new Map<Topic, Set<BusId>>();

  // Key: Topic, Value: Set of local NodeIds subscribed to this topic.
  private readonly localNodeSubscriptions = new Map<Topic, Set<NodeId>>();

  private capability!: RoutingRequires;

  public init(capability: RoutingRequires): void {
    this.capability = capability;
    const { semanticEvents, busEvents } = this.capability;

    // Listen for state updates from child buses.
    semanticEvents.on("subscriptionUpdate", (message, source) => {
      if (source.type === "child") this.handleControlMessage(message, source);
    });
    semanticEvents.on("nodeAnnouncement", (message, source) => {
      if (source.type === "child") this.handleControlMessage(message, source);
    });

    // Clean up routes when a connection is dropped.
    busEvents.on("connectionDropped", ({ source }) => {
      this.purgeEntriesForSource(source);
    });

    // When a parent connection is established, push full local state upstream.
    busEvents.on("connectionReady", ({ source }) => {
      if (source.type === "parent") {
        this.propagateFullStateUpstream();
      }
    });
  }

  public contribute(): RoutingContribution {
    return {
      announceNode: this.announceNode.bind(this),
      updateLocalSubscription: this.updateLocalSubscription.bind(this),
      getNextHop: this.getNextHop.bind(this),
      getBroadcastDownstream: this.getBroadcastDownstream.bind(this),
      getLocalSubscribers: this.getLocalSubscribers.bind(this),
    };
  }

  public close(): void {
    this.nodeRoutes.clear();
    this.remoteTopicHops.clear();
    this.localNodeSubscriptions.clear();
  }

  public async announceNode(
    nodeId: NodeId,
    isAvailable: boolean
  ): Promise<void> {
    if (isAvailable) {
      this.nodeRoutes.set(nodeId, { type: "local" });
    } else {
      this.nodeRoutes.delete(nodeId);
    }
    await this.propagateNodeChangeUpstream([{ nodeId, isAvailable }]);
  }

  public async updateLocalSubscription(
    nodeId: NodeId,
    topic: Topic,
    isSubscribed: boolean
  ): Promise<void> {
    const hadInterestBefore = this.hasInterest(topic);
    const subscribers = this.localNodeSubscriptions.get(topic) || new Set();

    if (isSubscribed) {
      subscribers.add(nodeId);
    } else {
      subscribers.delete(nodeId);
    }

    if (subscribers.size > 0) {
      this.localNodeSubscriptions.set(topic, subscribers);
    } else {
      this.localNodeSubscriptions.delete(topic);
    }

    const hasInterestNow = this.hasInterest(topic);

    // Only propagate upstream if the overall interest state of this bus has changed.
    if (hadInterestBefore !== hasInterestNow) {
      await this.propagateSubscriptionChangeUpstream([
        { topic, isSubscribed: hasInterestNow },
      ]);
    }
  }

  public getNextHop(destination: NodeId): RouteHop | null {
    // 1. Prioritize local nodes.
    if (this.capability.hasNode(destination)) {
      return { type: "local" };
    }

    // 2. Check the route cache.
    const hop = this.nodeRoutes.get(destination);
    if (hop) {
      return hop;
    }

    // 3. Default to parent if connected (default-up routing).
    if (this.capability.hasParentConnection()) {
      return { type: "parent" };
    }

    // 4. No route found.
    return null;
  }

  public getBroadcastDownstream(
    topic: Topic,
    source: MessageSource
  ): MessageSource[] {
    const downstreams = new Set<string>();

    // Add local nodes if they are not the source of the broadcast.
    if (source.type !== "local" && this.getLocalSubscribers(topic).length > 0) {
      downstreams.add(JSON.stringify({ type: "local" }));
    }

    // Add all interested child buses, excluding the source bus.
    const sourceBusId = source.type === "child" ? source.busId : undefined;
    this.remoteTopicHops.get(topic)?.forEach((busId) => {
      if (busId !== sourceBusId) {
        downstreams.add(JSON.stringify({ type: "child", busId }));
      }
    });

    // Add parent if it's not the source and a connection exists.
    if (source.type !== "parent" && this.capability.hasParentConnection()) {
      downstreams.add(JSON.stringify({ type: "parent" }));
    }

    return Array.from(downstreams).map((s) => JSON.parse(s));
  }

  public getLocalSubscribers(topic: Topic): NodeId[] {
    return Array.from(this.localNodeSubscriptions.get(topic) || []);
  }

  private async handleControlMessage(
    message: NodeAnnouncementMessage | SubscriptionUpdateMessage,
    source: MessageSource & { type: "child" }
  ): Promise<void> {
    const messageKind = message.kind;
    try {
      if (messageKind === "node-announcement") {
        await this.handleNodeAnnouncementMessage(message, source);
      } else {
        await this.handleRemoteSubscriptionUpdate(message, source);
      }
      const response = {
        kind: `${messageKind}-response`,
        correlationId: message.correlationId,
      };
      this.sendMessage(source, response as ProtocolMessage);
    } catch (error: any) {
      const response = {
        kind: `${messageKind}-response`,
        correlationId: message.correlationId,
        errors: [
          {
            [messageKind === "node-announcement" ? "nodeId" : "topic"]:
              "unknown",
            error: serializeError(error),
          },
        ],
      };
      this.sendMessage(source, response as ProtocolMessage);
      throw error;
    }
  }

  private async handleNodeAnnouncementMessage(
    message: NodeAnnouncementMessage,
    from: MessageSource & { type: "child" }
  ): Promise<void> {
    const fromHop: RouteHop = { type: "child", busId: from.busId };
    const changesMade: { nodeId: NodeId; previousHop: RouteHop | undefined }[] =
      [];

    for (const ann of message.announcements) {
      if (ann.isAvailable) {
        const existingHop = this.nodeRoutes.get(ann.nodeId);
        // Conflict detection: node announced from a new path.
        if (
          existingHop &&
          (existingHop.type !== "child" || existingHop.busId !== from.busId)
        ) {
          this.revertNodeChanges(changesMade);
          throw new EbusError(`Node ID '${ann.nodeId}' conflict detected.`);
        }
        changesMade.push({ nodeId: ann.nodeId, previousHop: existingHop });
        this.nodeRoutes.set(ann.nodeId, fromHop);
      } else {
        const currentHop = this.nodeRoutes.get(ann.nodeId);
        if (currentHop?.type === "child" && currentHop.busId === from.busId) {
          changesMade.push({ nodeId: ann.nodeId, previousHop: currentHop });
          this.nodeRoutes.delete(ann.nodeId);
        }
      }
    }

    try {
      // Atomically propagate the changes upstream.
      await this.propagateNodeChangeUpstream(message.announcements);
    } catch (upstreamError) {
      // If upstream propagation fails, roll back local changes.
      this.revertNodeChanges(changesMade);
      throw upstreamError;
    }
  }

  private async handleRemoteSubscriptionUpdate(
    message: SubscriptionUpdateMessage,
    source: MessageSource & { type: "child" }
  ): Promise<void> {
    const busId = source.busId;
    const changesToPropagate: { topic: Topic; isSubscribed: boolean }[] = [];
    const changesMade: { topic: Topic; wasAdded: boolean }[] = [];

    for (const update of message.updates) {
      const hadInterestBefore = this.hasInterest(update.topic);
      const hops = this.remoteTopicHops.get(update.topic) || new Set();
      const hadHopBefore = hops.has(busId);

      if (update.isSubscribed) {
        if (!hadHopBefore) {
          hops.add(busId);
          changesMade.push({ topic: update.topic, wasAdded: true });
        }
      } else {
        if (hadHopBefore) {
          hops.delete(busId);
          changesMade.push({ topic: update.topic, wasAdded: false });
        }
      }

      if (hops.size > 0) this.remoteTopicHops.set(update.topic, hops);
      else this.remoteTopicHops.delete(update.topic);

      const hasInterestNow = this.hasInterest(update.topic);

      if (hadInterestBefore !== hasInterestNow) {
        changesToPropagate.push({
          topic: update.topic,
          isSubscribed: hasInterestNow,
        });
      }
    }

    if (changesToPropagate.length > 0) {
      try {
        await this.propagateSubscriptionChangeUpstream(changesToPropagate);
      } catch (upstreamError) {
        this.revertSubscriptionChanges(changesMade, busId);
        throw upstreamError;
      }
    }
  }

  private revertNodeChanges(
    changes: { nodeId: NodeId; previousHop: RouteHop | undefined }[]
  ): void {
    for (const change of changes.reverse()) {
      if (change.previousHop) {
        this.nodeRoutes.set(change.nodeId, change.previousHop);
      } else {
        this.nodeRoutes.delete(change.nodeId);
      }
    }
  }

  private revertSubscriptionChanges(
    changes: { topic: Topic; wasAdded: boolean }[],
    busId: BusId
  ): void {
    for (const change of changes.reverse()) {
      const hops = this.remoteTopicHops.get(change.topic);

      if (change.wasAdded) {
        hops?.delete(busId);
        if (hops?.size === 0) this.remoteTopicHops.delete(change.topic);
      } else {
        const existingHops = hops || new Set();
        existingHops.add(busId);
        this.remoteTopicHops.set(change.topic, existingHops);
      }
    }
  }

  private sendMessage(dest: MessageSource, msg: ProtocolMessage): void {
    if (dest.type === "parent") {
      this.capability.sendToParent(msg).catch(() => {});
    } else if (dest.type === "child") {
      this.capability.sendToChild(dest.busId, msg).catch(() => {});
    }
  }

  private async propagateSubscriptionChangeUpstream(
    updates: { topic: Topic; isSubscribed: boolean }[]
  ): Promise<void> {
    if (!this.capability.hasParentConnection() || updates.length === 0) return;

    const message: SubscriptionUpdateMessage = {
      kind: "sub-update",
      updates,
      correlationId: uuid(),
    };
    await this.capability.sendRequestAndWaitForAck({ type: "parent" }, message);
  }

  private async propagateNodeChangeUpstream(
    announcements: { nodeId: NodeId; isAvailable: boolean }[]
  ): Promise<void> {
    if (!this.capability.hasParentConnection() || announcements.length === 0)
      return;

    const message: NodeAnnouncementMessage = {
      kind: "node-announcement",
      announcements,
      correlationId: uuid(),
    };
    await this.capability.sendRequestAndWaitForAck({ type: "parent" }, message);
  }

  private propagateFullStateUpstream(): void {
    const allNodes = [
      ...this.capability.getLocalNodeIds(),
      ...Array.from(this.nodeRoutes.keys()),
    ];
    this.propagateNodeChangeUpstream(
      [...new Set(allNodes)].map((nodeId) => ({ nodeId, isAvailable: true }))
    ).catch((err) =>
      console.error(
        "[Routing] Error propagating full node state upstream:",
        err
      )
    );

    const allInterestedTopics = Array.from(
      new Set([
        ...this.localNodeSubscriptions.keys(),
        ...this.remoteTopicHops.keys(),
      ])
    );
    this.propagateSubscriptionChangeUpstream(
      allInterestedTopics.map((topic) => ({ topic, isSubscribed: true }))
    ).catch((err) =>
      console.error(
        "[Routing] Error propagating full subscription state upstream:",
        err
      )
    );
  }

  private purgeEntriesForSource(source: MessageSource): void {
    if (source.type === "local") return;

    const nodesToAnnounceUnavailable: NodeId[] = [];
    this.nodeRoutes.forEach((hop, nodeId) => {
      const shouldPurge =
        (source.type === "parent" && hop.type === "parent") ||
        (source.type === "child" &&
          hop.type === "child" &&
          hop.busId === source.busId);
      if (shouldPurge) {
        this.nodeRoutes.delete(nodeId);
        nodesToAnnounceUnavailable.push(nodeId);
      }
    });

    if (nodesToAnnounceUnavailable.length > 0) {
      this.propagateNodeChangeUpstream(
        nodesToAnnounceUnavailable.map((nodeId) => ({
          nodeId,
          isAvailable: false,
        }))
      );
    }

    if (source.type === "child") {
      const topicsWithChangedInterest: Topic[] = [];
      this.remoteTopicHops.forEach((hops, topic) => {
        const hadInterestBefore = this.hasInterest(topic);
        if (hops.has(source.busId)) {
          hops.delete(source.busId);
          if (hops.size === 0) this.remoteTopicHops.delete(topic);

          if (hadInterestBefore && !this.hasInterest(topic)) {
            topicsWithChangedInterest.push(topic);
          }
        }
      });

      if (topicsWithChangedInterest.length > 0) {
        this.propagateSubscriptionChangeUpstream(
          topicsWithChangedInterest.map((topic) => ({
            topic,
            isSubscribed: false,
          }))
        );
      }
    }
  }

  private hasInterest(topic: Topic): boolean {
    const hasLocal = (this.localNodeSubscriptions.get(topic)?.size ?? 0) > 0;
    const hasRemote = (this.remoteTopicHops.get(topic)?.size ?? 0) > 0;
    return hasLocal || hasRemote;
  }
}
