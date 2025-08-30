import type { Placeholder } from "../../types/protocol";
import { IllegalTypeError } from "../../types/errors.js";
import type {
  SerializerContext,
  TypeHandler,
} from "../serialization/type.handler";

/**
 * The placeholder structure for a serialized `IllegalTypeError` object.
 */
export interface IllegalTypeErrorPlaceholder extends Placeholder {
  _erpc_type: "illegal_type_error";
  name: string;
  message: string;
  stack?: string;
}

/**
 * A `TypeHandler` for serializing and deserializing `IllegalTypeError` and its subclasses.
 * This allows for transmitting erpc's specific validation errors.
 */
export const illegalTypeErrorHandler: TypeHandler<
  IllegalTypeError,
  IllegalTypeErrorPlaceholder
> = {
  name: "illegal_type_error",

  /**
   * Checks if a value is an instance of `IllegalTypeError`.
   */
  canHandle(value: unknown): value is IllegalTypeError {
    return value instanceof IllegalTypeError;
  },

  /**
   * Serializes an `IllegalTypeError` object into a JSON-compatible placeholder.
   */
  serialize(
    value: IllegalTypeError,
    _context: SerializerContext
  ): IllegalTypeErrorPlaceholder {
    return {
      _erpc_type: "illegal_type_error",
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  },

  /**
   * Deserializes a placeholder back into an `IllegalTypeError` instance.
   *
   * @remarks This currently reconstructs all errors as the base `IllegalTypeError`.
   * A more advanced implementation could use `placeholder.name` to reconstruct
   * the specific subclass (e.g., `IllegalParameterError`).
   */
  deserialize(
    placeholder: IllegalTypeErrorPlaceholder,
    _context: SerializerContext
  ): IllegalTypeError {
    // Note: This simplified deserialization loses the specific subclass type.
    const error = new IllegalTypeError(placeholder.message);
    error.name = placeholder.name;
    error.stack = placeholder.stack;
    return error;
  },
};
