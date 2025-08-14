import type {
  Api,
  Client,
  Transferable,
  TransferableArray,
} from "@eleplug/erpc";
import type {
  NodeId,
  Topic,
  SubscriptionHandle,
  PublisherOptions,
  ConsumerFactory,
  ApiFactory,
  BroadcastableArray,
} from "../types/common";
import type { PublisherClient } from "./publisher";
import type { EbusApi } from "../features/api/api.feature";

/**
 * Defines the core functionalities required by a `Node` instance.
 * This interface decouples the user-facing `Node` class from the internal
 * feature implementations that provide these capabilities.
 * @internal
 */
interface NodeDependencies<TApi extends Api<TransferableArray, Transferable>> {
  setApi(apiFactory: ApiFactory<TApi>): Promise<void>;
  subscribe(
    topic: Topic,
    consumerFactory: ConsumerFactory<Api<BroadcastableArray, Transferable>>
  ): Promise<SubscriptionHandle>;
  emiter<T extends Api<BroadcastableArray, Transferable>>(
    options: PublisherOptions
  ): PublisherClient<T>;
  closeNode(): Promise<void>;
}

/**
 * Represents an addressable entity on the EBUS network.
 * This class provides the primary user-facing interface for an application to
 * interact with the EBUS, including P2P communication, Pub/Sub, and lifecycle management.
 *
 * @template TApi The P2P API shape this node exposes to other nodes.
 */
export class Node<TApi extends Api<TransferableArray, Transferable> = any> {
  /** The unique identifier of this node. */
  public readonly id: NodeId;

  private readonly busApi: EbusApi;
  private readonly deps: NodeDependencies<TApi>;

  /**
   * @internal
   * Nodes should be created via `ebus.join()`, not constructed directly.
   */
  constructor(
    id: NodeId,
    busApi: EbusApi,
    dependencies: NodeDependencies<TApi>
  ) {
    this.id = id;
    this.busApi = busApi;
    this.deps = dependencies;
  }

  /**
   * Sets or replaces the P2P API for this node.
   * The procedures in the API can accept and return any `Transferable` type.
   *
   * @param apiFactory A factory function that returns the erpc API definition.
   */
  public async setApi(apiFactory: ApiFactory<TApi>): Promise<void> {
    return this.deps.setApi(apiFactory);
  }

  /**
   * Creates a typed client for point-to-point communication with another node.
   *
   * @template TheirApi The API shape of the target node.
   * @param targetNodeId The unique ID of the node to connect to.
   * @returns A promise that resolves to a type-safe erpc client.
   */
  public connectTo<TheirApi extends Api<TransferableArray, Transferable>>(
    targetNodeId: NodeId
  ): Promise<Client<TheirApi>> {
    return this.busApi.connectTo<TheirApi>(this.id, targetNodeId);
  }

  /**
   * Subscribes to a topic and provides an API to handle messages published to it.
   * The procedure arguments in the handler API must be `Broadcastable`.
   *
   * @param topic The topic to subscribe to.
   * @param consumerFactory A factory function that returns the erpc API for handling messages.
   * @returns A promise that resolves to a `SubscriptionHandle`, which can be used to cancel.
   */
  public async subscribe<
    THandlerApi extends Api<BroadcastableArray, Transferable>,
  >(
    topic: Topic,
    consumerFactory: ConsumerFactory<THandlerApi>
  ): Promise<SubscriptionHandle> {
    return this.deps.subscribe(topic, consumerFactory);
  }

  /**
   * Creates a publisher client for sending broadcast messages to a topic.
   *
   * @template THandlerApi The API shape of the consumers for this topic.
   * @param topic The topic to publish to.
   * @param options Optional publisher settings, such as `loopback`.
   * @returns A `PublisherClient` for making type-safe broadcast calls.
   */
  public emiter<THandlerApi extends Api<BroadcastableArray, Transferable>>(
    topic: string,
    options?: { loopback?: boolean }
  ): PublisherClient<THandlerApi> {
    return this.deps.emiter<THandlerApi>({
      topic,
      sourceNodeId: this.id,
      loopback: options?.loopback,
    });
  }

  /**
   * Gracefully closes this node, deregistering it from the network.
   * This will immediately reject any new incoming calls to this node.
   */
  public async close(): Promise<void> {
    await this.deps.closeNode();
  }
}
