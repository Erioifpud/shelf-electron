import type { TellProcedure } from "@eleplug/erpc";
import type { ProtocolMessage } from "../../types/protocol.js";

/**
 * Defines the internal erpc API that each EBUS peer stack exposes to its
 * adjacent, directly connected peer.
 *
 * This API is not for application use. It serves as the fundamental transport
 * mechanism for forwarding EBUS protocol messages between buses.
 *
 * @internal
 */
export type InternalApi = {
  /**
   * A fire-and-forget procedure used to forward a complete EBUS protocol
   * message to the receiving peer.
   *
   * @param message The EBUS protocol message to be forwarded.
   * @param fromBusPublicId The public, unique ID of the EBUS instance
   *                        sending this message.
   */
  forwardMessage: TellProcedure<
    any,
    [message: ProtocolMessage, fromBusPublicId: string]
  >;
};
