import type { Placeholder } from '../../types/protocol';
import { IllegalTypeError } from '../../types/errors.js';
import type { SerializerContext, TypeHandler } from '../serialization/type.handler';

/**
 * The placeholder structure for a serialized standard `Error` object.
 */
export interface ErrorPlaceholder extends Placeholder {
  _erpc_type: 'error_placeholder';
  name: string;
  message: string;
  stack?: string;
}

/**
 * A `TypeHandler` for serializing and deserializing standard `Error` objects.
 * This ensures that basic error information (name, message, stack) can be
 * transmitted across the wire.
 *
 * @remarks The order of handler registration is important. This handler should
 * be registered before more specific error handlers if they also extend `Error`.
 */
export const errorHandler: TypeHandler<Error, ErrorPlaceholder> = {
  name: 'error_placeholder',

  /**
   * Checks if a value is an `Error` instance but not a more specific
   * `IllegalTypeError` (which is handled by `illegalTypeErrorHandler`).
   */
  canHandle(value: unknown): value is Error {
    // This logic ensures it doesn't hijack errors meant for other handlers.
    return value instanceof Error && !(value instanceof IllegalTypeError);
  },

  /**
   * Serializes an `Error` object into a JSON-compatible placeholder.
   */
  serialize(value: Error, _context: SerializerContext): ErrorPlaceholder {
    return {
      _erpc_type: 'error_placeholder',
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  },

  /**
   * Deserializes a placeholder back into a standard `Error` instance.
   */
  deserialize(placeholder: ErrorPlaceholder, _context: SerializerContext): Error {
    const error = new Error(placeholder.message);
    error.name = placeholder.name;
    error.stack = placeholder.stack;
    return error;
  },
};