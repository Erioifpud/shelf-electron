import { v4 as uuid } from 'uuid';
import { PIN_FREE_KEY, PIN_ID_KEY, PIN_REQUEST_KEY, type Pin } from '../../types/pin';

/**
 * Represents a resource that has been pinned, along with its reference count.
 * @internal
 */
type PinnedResource<T> = {
  resource: T;
  refCount: number;
};

/**
 * Manages all locally pinned resources for an erpc node.
 *
 * This class acts as a central registry for objects and functions that are
 * passed by reference. It handles resource pinning, reference counting, and
 * release, decoupling this logic from the core erpc features.
 * Its own lifecycle is managed by a use counter (`acquire`/`release`).
 */
export class ResourceManager {
  private readonly resources = new Map<string, PinnedResource<any>>();
  /** A counter for how many features are currently using this manager instance. */
  private useCount = 0;

  /**
   * Called by a feature to signal that it is using this resource manager.
   * Increments the use counter.
   */
  public acquire(): void {
    this.useCount++;
  }

  /**
   * Called by a feature to signal that it has finished using this manager.
   * When the last user releases it, the manager is automatically destroyed.
   */
  public release(): void {
    this.useCount--;
    if (this.useCount <= 0) {
      this.destroy();
    }
  }

  /**
   * Pins an object, making it available for remote invocation, and returns its unique ID.
   * If the object is already pinned, its reference count is incremented.
   * @param obj The object or function to pin.
   * @returns The unique resource ID for the pinned object.
   */
  public pin<T extends object>(obj: T): string {
    const existingId = (obj as any)[PIN_ID_KEY];
    if (existingId && this.resources.has(existingId)) {
      const entry = this.resources.get(existingId)!;
      entry.refCount++;
      return existingId;
    }

    const id = uuid();
    Object.defineProperty(obj, PIN_ID_KEY, { value: id, configurable: true });
    this.resources.set(id, { resource: obj, refCount: 1 });
    return id;
  }

  /**
   * Retrieves a pinned resource by its ID.
   * @param id The unique resource ID.
   * @returns The pinned resource, or `undefined` if not found.
   */
  public get(id: string): any | undefined {
    return this.resources.get(id)?.resource;
  }

  /**
   * Decrements the reference count of a specific pinned resource.
   * If the count drops to zero, the resource is removed from the manager.
   * This is typically called in response to a 'release' message from a remote peer.
   * @param id The ID of the resource to release.
   */
  public releaseResource(id: string): void {
    const entry = this.resources.get(id);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount <= 0) {
      const { resource } = entry;
      // Clean up the ID property from the original object.
      if (resource && PIN_ID_KEY in resource) {
        delete (resource as any)[PIN_ID_KEY];
      }
      this.resources.delete(id);
    }
  }

  /**
   * Destroys the manager, forcibly releasing all pinned resources.
   * This is called when the last feature using the manager calls `release()`.
   */
  private destroy(): void {
    for (const { resource } of this.resources.values()) {
      if (resource && PIN_ID_KEY in resource) {
        delete (resource as any)[PIN_ID_KEY];
      }
    }
    this.resources.clear();
  }
}

/**
 * Marks a local object or function to be passed by reference in an RPC call.
 *
 * When an object wrapped with `pin()` is included in procedure arguments or
 * return values, the erpc serializer will not serialize its content. Instead,
* it will "pin" the object on the local peer and send a remote proxy to the
 * other peer. All interactions with this proxy will be forwarded back to the
 * original object.
 *
 * @param obj The local object or function to pin.
 * @returns A type-safe proxy representation of the object, `Pin<T>`.
 *
 * @example
 * ```ts
 * const localApi = {
 *   counter: 0,
 *   increment() { this.counter++; }
 * };
 *
 * // In a procedure:
 * return { remoteApi: pin(localApi) };
 *
 * // On the client:
 * const result = await client.getApi.ask();
 * await result.remoteApi.increment(); // This call executes on the server.
 * ```
 */
export function pin<T extends object>(obj: T): Pin<T> {
  if (PIN_FREE_KEY in obj) {
    // This is already a remote proxy, pinning it again is likely a mistake.
    return obj as Pin<T>;
  }
  // Attach a temporary, non-enumerable property that the serializer will detect.
  Object.defineProperty(obj, PIN_REQUEST_KEY, { value: true, configurable: true, enumerable: false });
  return obj as Pin<T>;
}

/**
 * Manually releases a remote pinned object.
 *
 * This function notifies the peer holding the original object that it is no
 * longer needed, allowing it to be garbage collected. While erpc uses a
 * `FinalizationRegistry` for automatic cleanup, calling `free()` explicitly
 * is good practice for managing resource lifetimes, especially in long-lived
 * applications.
 *
 * @param pinnedProxy The remote proxy object received from an RPC call.
 */
export async function free(pinnedProxy: Pin<any>): Promise<void> {
  const freeMethod = (pinnedProxy as any)[PIN_FREE_KEY];
  if (typeof freeMethod !== 'function') {
    // This object is not a valid remote proxy.
    return;
  }
  await freeMethod();
}