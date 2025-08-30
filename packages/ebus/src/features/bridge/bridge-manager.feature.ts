/**
 * @fileoverview
 * This feature is the gateway and connection manager for an EBUS instance. It is
 * responsible for all direct bus-to-bus communications, acting as the "border
 * control" for messages entering or leaving the local bus network. It manages
 * the lifecycle of isolated erpc stacks for each connection and enforces
 * security policies (allow/deny lists) at the boundary for runtime broadcast messages.
 */

import { v4 as uuid } from "uuid";
import {
  ResourceManager,
  StreamManager,
  type Feature,
  type Transport,
} from "@eleplug/erpc";
import { AsyncEventEmitter } from "@eleplug/transport";
import type { BusId } from "../../types/common.js";
import { EbusError } from "../../types/errors.js";
import type {
  ProtocolMessage,
  BroadcastMessage,
} from "../../types/protocol.js";
import type { MessageSource } from "../../session/session.interface.js";
import { createPeerStack, type BusBridge } from "./peer-stack.factory.js";
import type { ProtocolCoordinatorContribution } from "../protocol/protocol-coordinator.feature.js";

/**
 * Defines the configuration options for creating a new bridge to a child bus.
 */
export interface BridgeOptions {
  /** The underlying erpc transport for the connection. */
  transport: Transport;
  /** Optional. A whitelist of groups. If specified, only messages from nodes in these groups will be accepted. */
  allowList?: string[];
  /** Optional. A blacklist of groups. Messages from nodes in these groups will be rejected. Deny list takes precedence. */
  denyList?: string[];
}

/**
 * @internal
 * Represents the state of a single connection to a child bus, including its
 * erpc stack and its specific security policies.
 */
type ChildPeerStackEntry = {
  /** The isolated erpc instance for this connection. */
  stack: Awaited<ReturnType<typeof createPeerStack>>;
  /** A Set-based whitelist for efficient lookups. */
  allowList?: Set<string>;
  /** A Set-based blacklist for efficient lookups. */
  denyList?: Set<string>;
};

/**
 * Defines the raw, low-level events emitted by the BridgeManagerFeature,
 * representing state changes of its direct connections.
 */
export type BridgeConnectionEvents = {
  /** Emitted when a message is received from any connected bus and passes ingress checks. */
  message: (event: { source: MessageSource; message: ProtocolMessage }) => void;
  /** Emitted when a connection to an adjacent bus is lost for any reason. */
  connectionDropped: (event: { source: MessageSource; error?: Error }) => void;
  /** Emitted when a new connection to an adjacent bus is established and its peer stack is ready. */
  connectionReady: (event: { source: MessageSource }) => void;
};

/**
 * The capabilities contributed by the `BridgeManagerFeature` to the EBUS core.
 * This forms the primary API for interacting with the bus network topology.
 */
export interface BridgeConnectionContribution {
  /** The unique public ID of this EBUS instance. */
  readonly ebusId: string;
  /** The event emitter for raw bus connection events. */
  readonly busEvents: AsyncEventEmitter<BridgeConnectionEvents>;
  /** Sends a protocol message to the parent bus, if one exists. */
  sendToParent(message: ProtocolMessage): Promise<void>;
  /** Sends a protocol message to a specific child bus, subject to egress rules. */
  sendToChild(busId: BusId, message: ProtocolMessage): Promise<void>;
  /**
   * Establishes a new connection to a child bus.
   */
  bridge(options: BridgeOptions): Promise<void>;
  /** Checks if this bus is connected to a parent. */
  hasParentConnection(): boolean;
  /** Returns a list of all currently active child bus IDs. */
  getActiveChildBusIds(): BusId[];
  /**
   * Provides the security policies for a specific child bridge connection.
   * @internal Used by the RoutingFeature during node registration validation.
   */
  getBridgePolicies(
    busId: BusId
  ): { allowList?: Set<string>; denyList?: Set<string> } | undefined;
  /**
   * Pre-filters a list of child bus IDs based on the bridge's egress rules for a given set of groups.
   * @remarks This is an optimization tool for higher-level features like Pub/Sub to avoid
   * dispatching messages that would be dropped at the gateway anyway.
   */
  filterDownstreamChildren(busIds: BusId[], groups: string[]): BusId[];
}

type BcmRequires = ProtocolCoordinatorContribution;

/**
 * @class BridgeManagerFeature
 * Manages all direct bus-to-bus connections. It acts as the gatekeeper for all
 * inter-bus traffic, enforcing group-based security policies for runtime
 * broadcast messages. Node registration policies are handled by the RoutingFeature.
 */
export class BridgeManagerFeature
  implements Feature<BridgeConnectionContribution, BcmRequires>
{
  public readonly ebusId: string = uuid();
  private readonly busEvents = new AsyncEventEmitter<BridgeConnectionEvents>();
  private parentPeerStack: Awaited<ReturnType<typeof createPeerStack>> | null =
    null;
  private readonly childPeerStacks = new Map<BusId, ChildPeerStackEntry>();
  private nextBusId: BusId = 1;
  private capability!: BcmRequires;

  constructor(
    private readonly resourceManager: ResourceManager,
    private readonly streamManager: StreamManager,
    private readonly parentTransport?: Transport
  ) {}

  public async init(capability: BcmRequires): Promise<void> {
    this.capability = capability;
    if (this.parentTransport) {
      this.connectToParent(this.parentTransport);
    }
  }

  public contribute(): BridgeConnectionContribution {
    return {
      ebusId: this.ebusId,
      busEvents: this.busEvents,
      sendToParent: this.sendToParent.bind(this),
      sendToChild: this.sendToChild.bind(this),
      bridge: this.bridge.bind(this),
      hasParentConnection: () => !!this.parentPeerStack,
      getActiveChildBusIds: () => Array.from(this.childPeerStacks.keys()),
      getBridgePolicies: this.getBridgePolicies.bind(this),
      filterDownstreamChildren: this.filterDownstreamChildren.bind(this),
    };
  }

  /**
   * Creates a new bridge to a child bus. The returned promise resolves when the
   * underlying erpc peer stack is ready, not waiting for any application-level handshake.
   * @param options - The configuration for the bridge connection.
   * @returns A promise that resolves on successful connection or rejects on failure.
   */
  public bridge({
    transport,
    allowList,
    denyList,
  }: BridgeOptions): Promise<void> {
    const busId = this.nextBusId++;
    const source: MessageSource = { type: "child", busId };

    const bridgeInterface: BusBridge = {
      onMessageReceived: (message, _fromBusPublicId) => {
        const entry = this.childPeerStacks.get(busId);
        // INGRESS GATEWAY: Runtime check specifically for broadcast messages.
        // P2P messages are considered safe because their nodes are validated at registration time.
        if (message.kind === "broadcast") {
          if (
            !entry ||
            !this._checkGroupPermissions(message.sourceGroups, entry)
          ) {
            return; // Silently drop invalid broadcast message.
          }
        }
        // All other messages (control-plane, valid broadcasts, P2P) are forwarded.
        this.busEvents.emit("message", { source, message });
      },
      onConnectionClosed: (error) => {
        if (this.childPeerStacks.has(busId)) {
          this.childPeerStacks.delete(busId);
          this.busEvents.emit("connectionDropped", { source, error });
        }
      },
    };

    return createPeerStack(
      transport,
      bridgeInterface,
      this.resourceManager,
      this.streamManager
    )
      .then((stack) => {
        const entry: ChildPeerStackEntry = {
          stack,
          allowList: allowList ? new Set(allowList) : undefined,
          denyList: denyList ? new Set(denyList) : undefined,
        };
        this.childPeerStacks.set(busId, entry);
        this.busEvents.emit("connectionReady", { source });
      })
      .catch((err) => {
        throw new EbusError(
          `Failed to create peer stack for child bus ${busId}: ${err.message}`
        );
      });
  }

  /**
   * Performs the core group permission check against allow/deny lists.
   * @param groups - The source groups from the message.
   * @param entry - The configuration of the child bus bridge.
   * @returns `true` if the groups are permitted, `false` otherwise.
   * @internal
   */
  private _checkGroupPermissions(
    groups: string[],
    entry: ChildPeerStackEntry
  ): boolean {
    const { denyList, allowList } = entry;
    // The deny list is checked first and has higher precedence.
    if (denyList && groups.some((group) => denyList.has(group))) {
      return false;
    }
    // If an allow list is configured, at least one group must match.
    if (allowList && !groups.some((group) => allowList.has(group))) {
      return false;
    }
    return true;
  }

  /**
   * Establishes a connection to a parent bus.
   * @param transport - The transport to use for the parent connection.
   * @internal
   */
  private connectToParent(transport: Transport): void {
    const source: MessageSource = { type: "parent" };
    const bridgeInterface: BusBridge = {
      onMessageReceived: (message, _fromBusPublicId) => {
        this.busEvents.emit("message", { source, message });
      },
      onConnectionClosed: (error) => {
        if (this.parentPeerStack) {
          this.parentPeerStack = null;
          this.busEvents.emit("connectionDropped", { source, error });
        }
      },
    };
    createPeerStack(
      transport,
      bridgeInterface,
      this.resourceManager,
      this.streamManager
    )
      .then(async (stack) => {
        this.parentPeerStack = stack;
        this.busEvents.emit("connectionReady", { source });
        try {
          await this.capability.initiateHandshake(source);
        } catch (handshakeError) {
          await stack.close(handshakeError as Error);
        }
      })
      .catch((err) => {
        this.busEvents.emit("connectionDropped", { source, error: err });
      });
  }

  public getBridgePolicies(busId: BusId) {
    const entry = this.childPeerStacks.get(busId);
    if (!entry) return undefined;
    return { allowList: entry.allowList, denyList: entry.denyList };
  }

  public filterDownstreamChildren(busIds: BusId[], groups: string[]): BusId[] {
    return busIds.filter((busId) => {
      const entry = this.childPeerStacks.get(busId);
      if (!entry) return false;
      return this._checkGroupPermissions(groups, entry);
    });
  }

  public async sendToParent(message: ProtocolMessage): Promise<void> {
    if (!this.parentPeerStack) return;
    await this.parentPeerStack.capability.procedure.forwardMessage.tell(
      message,
      this.ebusId
    );
  }

  public async sendToChild(
    busId: BusId,
    message: ProtocolMessage
  ): Promise<void> {
    const entry = this.childPeerStacks.get(busId);
    if (!entry) return;

    // EGRESS GATEWAY: Runtime check specifically for broadcast messages.
    if (message.kind === "broadcast") {
      if (!this._checkGroupPermissions(message.sourceGroups, entry)) {
        return; // Silently drop invalid broadcast message.
      }
    }

    await entry.stack.capability.procedure.forwardMessage.tell(
      message,
      this.ebusId
    );
  }

  public async close(): Promise<void> {
    const closePromises = [
      this.parentPeerStack?.close(),
      ...Array.from(this.childPeerStacks.values()).map((entry) =>
        entry.stack.close()
      ),
    ].filter(Boolean) as Promise<void>[];

    await Promise.allSettled(closePromises);

    this.busEvents.removeAllListeners();
  }
}
