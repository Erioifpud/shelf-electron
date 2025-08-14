/**
 * The base class for all custom validation errors within eRPC.
 * This allows for specific error handling and serialization.
 */
export class IllegalTypeError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "IllegalTypeError";
    this.cause = cause;
  }
}

/**
 * An error thrown specifically when a procedure's input argument
 * validation fails.
 */
export class IllegalParameterError extends IllegalTypeError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "IllegalParameterError";
  }
}

/**
 * An error thrown specifically when a procedure's return value
 * validation fails.
 */
export class IllegalResultError extends IllegalTypeError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "IllegalResultError";
  }
}

/**
 * A generic error representing a failure during a remote procedure call.
 * It is often used to wrap an error received from the remote peer,
 * preserving the original error's message and cause.
 */
export class ProcedureError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ProcedureError";
    this.cause = cause;
  }
}
