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
import type { ProtocolMessage } from "../../types/protocol.js";
import type { MessageSource } from "../../session/session.interface.js";
import { createPeerStack, type BusBridge } from "./peer-stack.factory.js";
import type { ProtocolCoordinatorContribution } from "../protocol/protocol-coordinator.feature.js";

/**
 * The events emitted by the `BridgeManagerFeature`, representing raw
 * connection state changes and incoming messages from adjacent buses.
 */
export type BridgeConnectionEvents = {
  /** Emitted when a message is received from any connected bus. */
  message: (event: { source: MessageSource; message: ProtocolMessage }) => void;
  /** Emitted when a connection to an adjacent bus is lost. */
  connectionDropped: (event: { source: MessageSource; error?: Error }) => void;
  /** Emitted when a new connection to an adjacent bus is established and ready. */
  connectionReady: (event: { source: MessageSource }) => void;
};

/**
 * The capabilities contributed by the `BridgeManagerFeature` to the EBUS core.
 */
export interface BridgeConnectionContribution {
  /** The unique public ID of this EBUS instance. */
  readonly ebusId: string;
  /** The event emitter for raw bus connection events. */
  readonly busEvents: AsyncEventEmitter<BridgeConnectionEvents>;
  /** Sends a protocol message to the parent bus, if connected. */
  sendToParent(message: ProtocolMessage): Promise<void>;
  /** Sends a protocol message to a specific child bus. */
  sendToChild(busId: BusId, message: ProtocolMessage): Promise<void>;
  /**
   * Establishes a new child connection using the given transport and waits
   * for the handshake to complete.
   */
  bridge(transport: Transport): Promise<void>;
  /** Checks if a connection to a parent bus exists. */
  hasParentConnection(): boolean;
  /** Returns a list of all active child bus IDs. */
  getActiveChildBusIds(): BusId[];
}

type BcmRequires = ProtocolCoordinatorContribution;

/**
 * A feature that manages all direct bus-to-bus connections.
 *
 * It is responsible for creating and managing isolated `erpc` stacks (peer stacks)
 * for each connection to a parent or child bus. It acts as the gatekeeper,
 * normalizing all incoming/outgoing traffic into a unified event stream (`busEvents`)
 * and a set of `sendTo` functions for other features to use.
 */
export class BridgeManagerFeature
  implements Feature<BridgeConnectionContribution, BcmRequires>
{
  public readonly ebusId: string = uuid();
  private readonly busEvents = new AsyncEventEmitter<BridgeConnectionEvents>();

  private parentPeerStack: Awaited<ReturnType<typeof createPeerStack>> | null =
    null;
  private readonly childPeerStacks = new Map<
    BusId,
    Awaited<ReturnType<typeof createPeerStack>>
  >();
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
    };
  }

  public bridge(transport: Transport): Promise<void> {
    const busId = this.nextBusId++;
    const source: MessageSource = { type: "child", busId };

    return new Promise<void>((resolve, reject) => {
      const handshakeTimeout = setTimeout(() => {
        cleanupListeners();
        reject(new EbusError(`Handshake timeout for child bus ${busId}.`));
      }, 5000); // 5-second handshake timeout

      // The original logic for handshake completion relies on receiving
      // a 'handshake' message. This is restored.
      const messageListener = (event: {
        source: MessageSource;
        message: ProtocolMessage;
      }) => {
        if (
          event.source.type === "child" &&
          event.source.busId === busId &&
          event.message.kind === "handshake"
        ) {
          cleanupListeners();
          resolve();
        }
      };

      const dropListener = (event: {
        source: MessageSource;
        error?: Error;
      }) => {
        if (event.source.type === "child" && event.source.busId === busId) {
          cleanupListeners();
          reject(
            event.error ||
              new EbusError(
                `Connection with child bus ${busId} dropped before handshake.`
              )
          );
        }
      };

      const cleanupListeners = () => {
        clearTimeout(handshakeTimeout);
        this.busEvents.off("message", messageListener);
        this.busEvents.off("connectionDropped", dropListener);
      };

      this.busEvents.on("message", messageListener);
      this.busEvents.on("connectionDropped", dropListener);

      // The onMessageReceived callback is restored to its original signature.
      const bridgeInterface: BusBridge = {
        onMessageReceived: (message, _fromBusPublicId) => {
          // The fromBusPublicId is ignored here as the 'source' object
          // already contains all necessary routing information.
          this.busEvents.emit("message", { source, message });
        },
        onConnectionClosed: (error) => {
          if (this.childPeerStacks.has(busId)) {
            this.childPeerStacks.delete(busId);
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
        .then((stack) => {
          this.childPeerStacks.set(busId, stack);
          this.busEvents.emit("connectionReady", { source });
          // Peer stack is ready; now we wait for the messageListener to resolve the promise.
        })
        .catch((err) => {
          cleanupListeners();
          reject(
            new EbusError(
              `Failed to create peer stack for child bus ${busId}: ${err.message}`
            )
          );
        });
    });
  }

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
          // After connection is ready, initiate the handshake protocol.
          await this.capability.initiateHandshake(source);
        } catch (handshakeError) {
          // If handshake fails, close the newly created stack.
          await stack.close(handshakeError as Error);
        }
      })
      .catch((err) => {
        this.busEvents.emit("connectionDropped", { source, error: err });
      });
  }

  public async sendToParent(message: ProtocolMessage): Promise<void> {
    if (!this.parentPeerStack) return;
    // The call is restored to use the erpc client proxy directly.
    await this.parentPeerStack.capability.procedure.forwardMessage.tell(
      message,
      this.ebusId
    );
  }

  public async sendToChild(
    busId: BusId,
    message: ProtocolMessage
  ): Promise<void> {
    const stack = this.childPeerStacks.get(busId);
    if (!stack) return;
    await stack.capability.procedure.forwardMessage.tell(message, this.ebusId);
  }

  public async close(): Promise<void> {
    const closePromises = [
      this.parentPeerStack?.close(),
      ...Array.from(this.childPeerStacks.values()).map((s) => s.close()),
    ].filter(Boolean) as Promise<void>[];

    await Promise.allSettled(closePromises);

    this.busEvents.removeAllListeners();
  }
}
