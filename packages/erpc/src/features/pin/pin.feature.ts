import type { Feature } from "../../runtime/framework/feature";
import type { ResourceManager } from "./resource-manager";
import { createPinHandler } from "./pin.handler";
import type { ProtocolHandlerContribution } from "../protocol/protocol.handler.feature";
import type { SerializationContribution } from "../serialization/serialization.feature";
import type { TransportAdapterContribution } from "../transport/transport.adapter.feature";
import type { CallManagerContribution } from "../call/call-manager.feature";
import type { RpcRequestMessage } from "../../types/protocol";

export interface PinContribution {
  resourceManager: ResourceManager;
}

export type PinRequires = ProtocolHandlerContribution &
  SerializationContribution &
  TransportAdapterContribution &
  CallManagerContribution;

/**
 * A feature that provides object pinning capabilities.
 *
 * This feature enables passing objects and functions by reference. On the server
 * side, it listens for incoming RPC calls targeting pinned resources, executes
 * the requested operations on the actual local objects, and returns the results.
 */
export class PinFeature implements Feature<PinContribution, PinRequires> {
  private resourceManager: ResourceManager;
  private capability!: PinRequires;

  constructor(resourceManager: ResourceManager) {
    this.resourceManager = resourceManager;
    // Signal that this feature is using the shared resource manager.
    this.resourceManager.acquire();
  }

  public contribute(): PinContribution {
    return { resourceManager: this.resourceManager };
  }

  public init(capability: PinRequires): void {
    this.capability = capability;

    // Create and register the TypeHandler for pinning with the serialization system.
    const pinHandler = createPinHandler(this.resourceManager, capability);
    capability.serializer.registerHandler(pinHandler);

    // Listen for 'release' messages triggered by remote `free()` calls or GC.
    capability.semanticEmitter.on("release", (message) => {
      this.resourceManager.releaseResource(message.resourceId);
    });

    // Listen for 'pinCall' RPC requests dispatched by the protocol handler.
    capability.semanticEmitter.on("pinCall", (message) => {
      this.handlePinCall(message);
    });
  }

  /**
   * Handles an RPC call targeting a locally pinned resource.
   * @param message The incoming RPC request message.
   */
  private async handlePinCall(message: RpcRequestMessage): Promise<void> {
    const { callId, path: propertyName, input: serializedInput } = message;

    try {
      const { serializer, sendRawMessage } = this.capability;

      // 1. Deserialize the arguments array.
      const args = serializedInput.map((arg) => serializer.deserialize(arg));
      const [resourceId, ...callArgs] = args as [string, ...any[]];

      // 2. Look up the pinned resource.
      const resource = this.resourceManager.get(resourceId);
      if (!resource) {
        throw new Error(`Pinned resource with ID '${resourceId}' not found.`);
      }

      // 3. Determine the operation and execute it.
      let result: any;
      if (propertyName === "apply") {
        // This is a direct call to a pinned function.
        if (typeof resource !== "function") {
          throw new Error(
            `Pinned resource with ID '${resourceId}' is not a function.`
          );
        }
        result = await Promise.resolve(resource(...callArgs));
      } else {
        // This is an access to a property or method on a pinned object.
        const target = (resource as any)[propertyName];
        if (typeof target === "function") {
          // Method call.
          result = await Promise.resolve(target.apply(resource, callArgs));
        } else {
          // Property access (getter or setter).
          if (callArgs.length > 1) {
            throw new Error(
              `Property '${propertyName}' on resource '${resourceId}' is not a function.`
            );
          }
          if (callArgs.length === 1) {
            // Setter: `remote.prop = value`
            (resource as any)[propertyName] = callArgs[0];
            result = undefined; // Setters acknowledge with no value.
          } else {
            // Getter: `await remote.prop()`
            result = target;
          }
        }
      }

      // 4. Serialize the result and send a success response.
      const serializedOutput = serializer.serialize(result);
      await sendRawMessage({
        type: "rpc-response",
        callId,
        success: true,
        output: serializedOutput,
      });
    } catch (err: any) {
      // 5. If any error occurs, serialize it and send a failure response.
      const { serializer, sendRawMessage } = this.capability;
      const serializedError = serializer.serialize(err);
      await sendRawMessage({
        type: "rpc-response",
        callId,
        success: false,
        output: serializedError,
      });
    }
  }

  public close(contribution: PinContribution, _error?: Error): void {
    // When the erpc node shuts down, release the manager to free all resources.
    contribution.resourceManager.release();
  }
}
