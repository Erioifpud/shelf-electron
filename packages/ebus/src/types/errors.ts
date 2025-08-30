/**
 * The base class for all custom errors within the EBUS system.
 */
export class EbusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EbusError";
  }
}

/**
 * Thrown when an operation targets a node that cannot be found or reached.
 */
export class NodeNotFoundError extends EbusError {
  public readonly details: { nodeId: string };

  constructor(nodeId: string) {
    super(`Node '${nodeId}' not found or unreachable.`);
    this.name = "NodeNotFoundError";
    this.details = { nodeId };
  }
}

/**
 * Thrown when a call is made to a node that has joined the network but
 * has not yet had its API set via `node.setApi()`.
 */
export class ProcedureNotReadyError extends EbusError {
  public readonly details: { nodeId: string };

  constructor(nodeId: string) {
    super(`The API for node '${nodeId}' has not been set yet.`);
    this.name = "ProcedureNotReadyError";
    this.details = { nodeId };
  }
}

/**
 * Thrown when a node attempts an action (e.g., P2P connect, subscribe)
 * that is forbidden by group permission rules.
 */
export class GroupPermissionError extends EbusError {
  constructor(message: string) {
    super(message);
    this.name = "GroupPermissionError";
  }
}

/**
 * A serializable, network-transferable representation of an error.
 */
export type SerializableEbusError = {
  name: string;
  message: string;
  stack?: string;
  details?: { [key: string]: any };
};

/**
 * Converts an Error instance (or any thrown value) into a `SerializableEbusError`.
 * @param e The error or value to serialize.
 * @returns A plain object suitable for network transmission.
 */
export function serializeError(e: any): SerializableEbusError {
  const error = e instanceof Error ? e : new EbusError(String(e));
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    details: (error as any).details, // Preserve custom details if they exist
  };
}

/**
 * Reconstructs an `EbusError` or its subclass from its serialized form.
 * @param error The serialized error object received from the network.
 * @returns An instance of `EbusError` or a more specific subclass.
 */
export function deserializeError(error: SerializableEbusError): EbusError {
  let ebusError: EbusError;

  // Reconstruct specific error types based on the 'name' property.
  if (error.name === "NodeNotFoundError" && error.details?.nodeId) {
    ebusError = new NodeNotFoundError(error.details.nodeId);
  } else if (error.name === "ProcedureNotReadyError" && error.details?.nodeId) {
    ebusError = new ProcedureNotReadyError(error.details.nodeId);
  } else if (error.name === "GroupPermissionError") {
    ebusError = new GroupPermissionError(error.message);
  } else {
    // Default to the base EbusError.
    ebusError = new EbusError(error.message);
  }

  // Restore common properties.
  ebusError.name = error.name || "EbusError";
  ebusError.stack = error.stack;
  if (error.details) {
    (ebusError as any).details = error.details;
  }
  return ebusError;
}
