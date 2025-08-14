import type { TypeHandler } from '../serialization/type.handler';
import { PIN_FREE_KEY, PIN_ID_KEY, PIN_REQUEST_KEY, type Pin } from '../../types/pin';
import type { ResourceManager } from './resource-manager';
import type { CallManagerContribution } from '../call/call-manager.feature';
import type { TransportAdapterContribution } from '../transport/transport.adapter.feature';
import type { ControlMessage, Placeholder } from '../../types/protocol';

/** The placeholder structure for a serialized pinned object. */
export interface PinPlaceholder extends Placeholder {
  _erpc_type: 'pin';
  resourceId: string;
}

/** The context needed for the FinalizationRegistry's cleanup callback. @internal */
interface ProxyFinalizationContext {
  resourceId: string;
  sendRawMessage: (message: ControlMessage) => Promise<void>;
}

/**
 * A `FinalizationRegistry` that tracks remote proxy objects for garbage collection.
 * When a remote proxy is GC'd on the client, this registry automatically sends
 * a 'release' message to the server. This prevents memory leaks on the server
 * if the client forgets to call `free()` manually.
 * @internal
 */
const remoteProxyRegistry = new FinalizationRegistry<ProxyFinalizationContext>(
  (heldValue) => {
    const { resourceId, sendRawMessage } = heldValue;
    sendRawMessage({ type: 'release', resourceId }).catch((err: Error) => {
      console.error(
        `[erpc gc] Failed to send release message for GC'd resource ${resourceId}:`,
        err,
      );
    });
  },
);

/**
 * Creates a proxy object representing a remote pinned resource.
 * All interactions with this proxy are translated into RPC calls.
 * @param resourceId The unique ID of the remote resource.
 * @param capability The required capabilities for communication.
 * @returns A fully functional, type-safe remote proxy.
 * @internal
 */
function createPinProxy(resourceId: string, capability: TransportAdapterContribution & CallManagerContribution): Pin<any> {
  const { trackAsk, sendRawMessage } = capability;
  let isFreed = false;

  const proxy = new Proxy(() => { }, {
    get: (_target, prop: string | symbol) => {
      // Expose the resource ID for debugging.
      if (prop === PIN_ID_KEY) return resourceId;
      // Prevent the proxy from being treated as a Promise.
      if (prop === 'then') return undefined;

      // Implement the manual `free()` method.
      if (prop === PIN_FREE_KEY) {
        return async (): Promise<void> => {
          if (isFreed) return;
          isFreed = true;
          remoteProxyRegistry.unregister(proxy); // Stop tracking for GC.
          await sendRawMessage({ type: 'release', resourceId });
        };
      }

      if (typeof prop === 'symbol') return undefined;

      if (isFreed) {
        const errorMessage = `[erpc] Cannot access property '${String(prop)}' on a freed pin proxy (id: ${resourceId}).`;
        // Return a function that rejects to handle both property access and method calls.
        return () => Promise.reject(new Error(errorMessage));
      }

      // For any other property access, return a function that will make an RPC call.
      // This handles both method calls (`remote.foo()`) and property getters (`await remote.prop()`).
      return (...args: any[]) => {
        const payload = [resourceId, ...args];
        return trackAsk(String(prop), payload, undefined, 'pin');
      };
    },

    apply: (_target, _thisArg, args: any[]) => {
      // This handles direct calls to a pinned function (`remote()`).
      if (isFreed) {
        return Promise.reject(new Error(`[erpc] Cannot call a freed pin proxy as a function (id: ${resourceId}).`));
      }
      const payload = [resourceId, ...args];
      // 'apply' is the conventional path for calling the function itself.
      return trackAsk('apply', payload, undefined, 'pin');
    },
  }) as Pin<any>;

  // Register the proxy with the GC tracker.
  remoteProxyRegistry.register(
    proxy,
    { resourceId, sendRawMessage }, // The context for the cleanup callback.
    proxy, // The unregister token.
  );

  return proxy;
}

/**
 * Creates the `TypeHandler` for the Pinning feature.
 * This factory function ensures the handler is created with access to the
 * necessary runtime capabilities.
 * @param resourceManager The local resource manager instance.
 * @param capability The required capabilities for communication.
 * @returns A `TypeHandler` instance for processing pinned objects.
 * @internal
 */
export function createPinHandler(
  resourceManager: ResourceManager,
  capability: CallManagerContribution & TransportAdapterContribution,
): TypeHandler<object, PinPlaceholder> {

  return {
    name: 'pin',

    canHandle(value: unknown): value is object {
      // An object is recognized as needing to be pinned if it has the temporary request key.
      return typeof value === 'object' && value !== null && (value as any)[PIN_REQUEST_KEY];
    },

    serialize(value) {
      // Serialization: Pin the local object in the resource manager and get its ID.
      const resourceId = resourceManager.pin(value);
      return { _erpc_type: 'pin', resourceId };
    },

    deserialize(placeholder) {
      // Deserialization: Create a remote proxy on the client using the resource ID.
      return createPinProxy(placeholder.resourceId, capability);
    },
  };
}