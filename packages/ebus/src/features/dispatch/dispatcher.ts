import type { DispatchContext, DispatchHandler } from './dispatch.handler.js';

/**
 * The core engine for managing and executing dispatch (deep cloning) operations.
 *
 * It iterates through a collection of `DispatchHandler` plugins to handle
 * special data types, and provides a default, recursive deep-cloning mechanism
 * for plain objects and arrays. It also correctly handles circular references.
 * @internal
 */
export class Dispatcher {
  private readonly handlers: ReadonlyArray<DispatchHandler<any>>;

  constructor(customHandlers: DispatchHandler<any>[]) {
    this.handlers = customHandlers;
  }

  /**
   * The main public method to create `count` deep copies of a given value.
   *
   * @param value The value to clone.
   * @param count The number of copies to create.
   * @returns An array containing `count` cloned instances.
   */
  public dispatch<T>(value: T, count: number): T[] {
    if (count <= 0) return [];
    // The WeakMap is used to track seen objects and handle cycles.
    return this._dispatch(value, count, new WeakMap());
  }

  /**
   * The internal recursive dispatch implementation.
   *
   * @param value The current value to process.
   * @param count The number of copies to create.
   * @param seen A map to track objects that have already been cloned in this
   *             dispatch operation, to handle circular references. The map's
   *             value is an array of the already-created clones.
   * @returns An array of cloned values.
   */
  private _dispatch(value: any, count: number, seen: WeakMap<object, any[]>): any[] {
    // Primitives, null, and Uint8Array are immutable or treated as such.
    // They can be copied by reference safely and efficiently.
    if (value === null || typeof value !== 'object' || value instanceof Uint8Array) {
      return Array(count).fill(value);
    }
    
    // If we've already cloned this object, return the existing clones.
    if (seen.has(value)) {
      return seen.get(value)!;
    }

    // 1. Check for a custom handler for this specific type.
    for (const handler of this.handlers) {
        if (handler.canHandle(value)) {
            const context: DispatchContext = {
                dispatch: (v, c) => this._dispatch(v, c, seen)
            };
            return handler.dispatch(value, count, context);
        }
    }
      
      // 2. Default handling for arrays.
      if (Array.isArray(value)) {
          const clonedArrays: any[][] = Array.from({ length: count }, () => []);
          // Register the empty arrays in `seen` *before* recursive calls
          // to correctly handle cycles.
          seen.set(value, clonedArrays);
          
          for (const item of value) {
              const clonedItems = this._dispatch(item, count, seen);
              for (let i = 0; i < count; i++) {
                  clonedArrays[i].push(clonedItems[i]);
              }
          }
          return clonedArrays;
      }

      // 3. Default handling for plain objects.
      const clonedObjects: Record<string, any>[] = Array.from({ length: count }, () => ({}));
      // Register the empty objects in `seen` before recursion.
      seen.set(value, clonedObjects);

      for (const key in value) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
              const clonedValues = this._dispatch(value[key], count, seen);
              for (let i = 0; i < count; i++) {
                  clonedObjects[i][key] = clonedValues[i];
              }
          }
      }
      
      return clonedObjects;
  }
}