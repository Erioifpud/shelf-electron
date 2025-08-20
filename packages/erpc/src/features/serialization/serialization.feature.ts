import type { JsonValue } from "@eleplug/transport";
import type { Feature } from "../../runtime/framework/feature";
import type { TypeHandler } from "./type.handler";
import { Serializer } from "./serializer";

/**
 * The capabilities contributed by the `SerializationFeature`.
 * It provides a centralized, extensible serialization service.
 */
export interface SerializationContribution {
  serializer: {
    /** Serializes a value into a `JsonValue`, handling special types via handlers. */
    serialize: (value: any) => JsonValue;
    /** Deserializes a `JsonValue` back into its original type. */
    deserialize: (value: JsonValue) => any;
    /** Registers a custom `TypeHandler` to support a new data type. */
    registerHandler: (handler: TypeHandler<any, any>) => void;
  };
}

/**
 * A feature that provides a powerful, extensible serialization system.
 *
 * This feature allows erpc to transfer rich data types that are not natively
 * supported by JSON, such as Streams, Dates, or custom classes. It works by
 * allowing other features to register `TypeHandler` plugins.
 *
 * It employs a two-phase initialization strategy to resolve circular dependencies:
 * 1. `contribute`: Provides a proxy interface. `registerHandler` collects handlers.
 * 2. `init`: Instantiates the real `Serializer` with all collected handlers.
 */
export class SerializationFeature
  implements Feature<SerializationContribution>
{
  // A temporary store for handlers registered before the serializer is initialized.
  private handlersToRegister: TypeHandler<any, any>[] = [];
  // The real serializer instance, created during the `init` phase.
  private serializerInstance!: Serializer;

  public contribute(): SerializationContribution {
    return {
      serializer: {
        /**
         * A proxy method that delegates to the real serializer once initialized.
         */
        serialize: (value) => {
          if (!this.serializerInstance) {
            throw new Error(
              "SerializationFeature not initialized. Cannot call 'serialize'."
            );
          }
          return this.serializerInstance.serialize(value);
        },

        deserialize: (value) => {
          if (!this.serializerInstance) {
            throw new Error(
              "SerializationFeature not initialized. Cannot call 'deserialize'."
            );
          }
          return this.serializerInstance.deserialize(value);
        },

        /**
         * This method can be safely called by other features during their `init` phase.
         * It collects handlers to be used when the real serializer is created.
         */
        registerHandler: (handler) => {
          this.handlersToRegister.push(handler);
        },
      },
    };
  }

  /**
   * Initializes the feature by creating the `Serializer` instance.
   * At this point, all other features have had a chance to register their
   * `TypeHandler`s via the contributed `registerHandler` method.
   */
  public init(_capability: unknown): void {
    this.serializerInstance = new Serializer(this.handlersToRegister);
  }

  public close(_contribution: SerializationContribution, _error?: Error): void {
    // This feature is stateless and requires no cleanup.
  }
}