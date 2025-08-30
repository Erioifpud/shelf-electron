/**
 * @fileoverview
 * This feature manages all P2P and Pub/Sub routing logic. It acts as the
 * "admission controller" for new nodes joining the network through child buses,
 * validating their legitimacy against bridge policies at registration time. It
 * also maintains an efficient index for cleaning up routes when a connection is
 * dropped, forming the distributed routing table of the EBUS network.
 */

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
import {
  EbusError,
  GroupPermissionError,
  serializeError,
} from "../../types/errors.js";

/** @internal Represents the next hop for a route. */
type RouteHop =
  | { type: "local" }
  | { type: "parent" }
  | { type: "child"; busId: BusId };

/** @internal Represents a node's full routing information. */
type NodeRouteInfo = { hop: RouteHop; groups: Set<string> };

/**
 * The capabilities contributed by the RoutingFeature to the EBUS core.
 */
export interface RoutingContribution {
  /** Announces the availability state of a local node to the network. */
  announceNode(
    nodeId: NodeId,
    isAvailable: boolean
  ): Promise<void> /** Updates the subscription state for a local node and propagates the change. */;
  updateLocalSubscription(
    nodeId: NodeId,
    topic: Topic,
    isSubscribed: boolean
  ): Promise<void> /** Gets the next routing hop for a destination node ID. */;
  getNextHop(destination: NodeId): RouteHop | null;
  /** Gets the groups for a given node ID, if known by the routing table. */
  getNodeGroups(
    nodeId: NodeId
  ):
    | Set<string>
    | undefined /** Calculates all downstream branches for a broadcast message based on topic interest. */;
  getBroadcastDownstream(
    topic: Topic,
    source: MessageSource
  ): MessageSource[] /** Gets all local node IDs subscribed to a specific topic. */;
  getLocalSubscribers(topic: Topic): NodeId[];
}

type RoutingRequires = BridgeConnectionContribution &
  LocalNodeContribution &
  ProtocolCoordinatorContribution;

/**
 * @class RoutingFeature
 * The brain of the EBUS network. It doesn't handle message payloads but decides
 * where they should go. It learns the network topology and subscription states
 * from announcements and propagates its own state upstream, forming a distributed
 * routing information base.
 */
export class RoutingFeature
  implements Feature<RoutingContribution, RoutingRequires>
{
  /** Main routing table: NodeId -> { hop, groups } */
  private readonly nodeRoutes = new Map<NodeId, NodeRouteInfo>();
  /** Index for remote topic interest: Topic -> Set<BusId> */
  private readonly remoteTopicHops = new Map<Topic, Set<BusId>>();
  /** Index for local topic subscriptions: Topic -> Set<NodeId> */
  private readonly localNodeSubscriptions = new Map<Topic, Set<NodeId>>();
  /**
   * @internal
   * OPTIMIZATION: A reverse map to quickly find all nodes connected via a specific child bus.
   * This makes cleanup on disconnect much more efficient (O(k) vs O(n)).
   */
  private readonly childBusNodeMap = new Map<BusId, Set<NodeId>>();

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
      getNodeGroups: this.getNodeGroups.bind(this),
      getBroadcastDownstream: this.getBroadcastDownstream.bind(this),
      getLocalSubscribers: this.getLocalSubscribers.bind(this),
    };
  }

  public close(): void {
    this.nodeRoutes.clear();
    this.remoteTopicHops.clear();
    this.localNodeSubscriptions.clear();
    this.childBusNodeMap.clear();
  }

  public async announceNode(
    nodeId: NodeId,
    isAvailable: boolean
  ): Promise<void> {
    const nodeGroups =
      this.capability.getLocalNodeGroups(nodeId) ?? new Set([""]);
    if (isAvailable) {
      this.nodeRoutes.set(nodeId, {
        hop: { type: "local" },
        groups: nodeGroups,
      });
    } else {
      this.nodeRoutes.delete(nodeId);
    }
    await this.propagateNodeChangeUpstream([
      { nodeId, isAvailable, groups: Array.from(nodeGroups) },
    ]);
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
    if (hadInterestBefore !== hasInterestNow) {
      await this.propagateSubscriptionChangeUpstream([
        { topic, isSubscribed: hasInterestNow },
      ]);
    }
  }

  public getNextHop(destination: NodeId): RouteHop | null {
    if (this.capability.hasNode(destination)) {
      return { type: "local" };
    }
    const routeInfo = this.nodeRoutes.get(destination);
    if (routeInfo) {
      return routeInfo.hop;
    }
    if (this.capability.hasParentConnection()) {
      return { type: "parent" };
    }
    return null;
  }

  public getNodeGroups(nodeId: NodeId): Set<string> | undefined {
    if (this.capability.hasNode(nodeId)) {
      return this.capability.getLocalNodeGroups(nodeId);
    }
    return this.nodeRoutes.get(nodeId)?.groups;
  }

  public getBroadcastDownstream(
    topic: Topic,
    source: MessageSource
  ): MessageSource[] {
    const downstreams = new Set<string>();
    if (source.type !== "local" && this.getLocalSubscribers(topic).length > 0) {
      downstreams.add(JSON.stringify({ type: "local" }));
    }
    const sourceBusId = source.type === "child" ? source.busId : undefined;
    this.remoteTopicHops.get(topic)?.forEach((busId) => {
      if (busId !== sourceBusId) {
        downstreams.add(JSON.stringify({ type: "child", busId }));
      }
    });
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
      // If validation fails, catch the error and send it in the response,
      // which will cause the remote join() call to fail as intended.
      const response = {
        kind: `${messageKind}-response`,
        correlationId: message.correlationId,
        errors: [
          {
            [messageKind === "node-announcement" ? "nodeId" : "topic"]:
              "multiple",
            error: serializeError(error),
          },
        ],
      };
      this.sendMessage(source, response as ProtocolMessage);
    }
  }

  private async handleNodeAnnouncementMessage(
    message: NodeAnnouncementMessage,
    from: MessageSource & { type: "child" }
  ): Promise<void> {
    // 1. ADMISSION CONTROL: Fetch policies for this specific bridge connection.
    const policies = this.capability.getBridgePolicies(from.busId);
    const { allowList, denyList } = policies ?? {};
    const fromHop: RouteHop = { type: "child", busId: from.busId };
    const changesMade: {
      nodeId: NodeId;
      previousInfo: NodeRouteInfo | undefined;
    }[] = [];

    for (const ann of message.announcements) {
      if (ann.isAvailable) {
        // 2. ENFORCE POLICIES at registration time.
        if (denyList && ann.groups.some((g) => denyList.has(g))) {
          throw new GroupPermissionError(
            `Node '${ann.nodeId}' is denied by group policy.`
          );
        }
        if (allowList && !ann.groups.some((g) => allowList.has(g))) {
          throw new GroupPermissionError(
            `Node '${ann.nodeId}' is not in an allowed group.`
          );
        }
        const existingInfo = this.nodeRoutes.get(ann.nodeId);
        if (
          existingInfo &&
          (existingInfo.hop.type !== "child" ||
            existingInfo.hop.busId !== from.busId)
        ) {
          throw new EbusError(`Node ID '${ann.nodeId}' conflict detected.`);
        }
        changesMade.push({ nodeId: ann.nodeId, previousInfo: existingInfo });
        this.nodeRoutes.set(ann.nodeId, {
          hop: fromHop,
          groups: new Set(ann.groups),
        });
        const nodes = this.childBusNodeMap.get(from.busId) ?? new Set();
        nodes.add(ann.nodeId);
        this.childBusNodeMap.set(from.busId, nodes);
      } else {
        const currentInfo = this.nodeRoutes.get(ann.nodeId);
        if (
          currentInfo?.hop.type === "child" &&
          currentInfo.hop.busId === from.busId
        ) {
          changesMade.push({ nodeId: ann.nodeId, previousInfo: currentInfo });
          this.nodeRoutes.delete(ann.nodeId);
          this.childBusNodeMap.get(from.busId)?.delete(ann.nodeId);
        }
      }
    }

    try {
      // 3. PROPAGATE valid announcements upstream.
      await this.propagateNodeChangeUpstream(message.announcements);
    } catch (upstreamError) {
      // If upstream propagation fails, roll back the local changes for atomicity.
      this.revertNodeChanges(changesMade);
      // Revert changes to childBusNodeMap
      changesMade.forEach((change) => {
        if (change.previousInfo) {
          const nodes = this.childBusNodeMap.get(from.busId);
          if (nodes) {
            const prevHop = change.previousInfo.hop;
            if (prevHop.type === "child" && prevHop.busId === from.busId) {
              nodes.add(change.nodeId);
            } else {
              nodes.delete(change.nodeId);
            }
          }
        } else {
          this.childBusNodeMap.get(from.busId)?.delete(change.nodeId);
        }
      });
      throw upstreamError;
    }
  }

  private purgeEntriesForSource(source: MessageSource): void {
    if (source.type === "local") return;

    let nodesToPurge: NodeId[] = [];
    if (source.type === "parent") {
      this.nodeRoutes.forEach((routeInfo, nodeId) => {
        if (routeInfo.hop.type === "parent") {
          nodesToPurge.push(nodeId);
        }
      });
    } else {
      nodesToPurge = Array.from(this.childBusNodeMap.get(source.busId) ?? []);
      this.childBusNodeMap.delete(source.busId);
    }

    if (nodesToPurge.length > 0) {
      nodesToPurge.forEach((nodeId) => this.nodeRoutes.delete(nodeId));
      this.propagateNodeChangeUpstream(
        nodesToPurge.map((nodeId) => ({
          nodeId,
          isAvailable: false,
          groups: [],
        }))
      );
    }

    if (source.type === "child") {
      const topicsWithChangedInterest: Topic[] = [];
      this.remoteTopicHops.forEach((hops, topic) => {
        if (hops.has(source.busId)) {
          const hadInterestBefore = this.hasInterest(topic);
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
    changes: { nodeId: NodeId; previousInfo: NodeRouteInfo | undefined }[]
  ): void {
    for (const change of changes.reverse()) {
      if (change.previousInfo) {
        this.nodeRoutes.set(change.nodeId, change.previousInfo);
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
    announcements: { nodeId: NodeId; isAvailable: boolean; groups: string[] }[]
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
      [...new Set(allNodes)].map((nodeId) => ({
        nodeId,
        isAvailable: true,
        groups: Array.from(this.getNodeGroups(nodeId) ?? [""]),
      }))
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
  private hasInterest(topic: Topic): boolean {
    const hasLocal = (this.localNodeSubscriptions.get(topic)?.size ?? 0) > 0;
    const hasRemote = (this.remoteTopicHops.get(topic)?.size ?? 0) > 0;
    return hasLocal || hasRemote;
  }
}
