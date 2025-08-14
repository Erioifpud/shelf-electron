
/**
 * Configuration options for the DuplexTransport.
 */
export interface DuplexTransportOptions {
  /**
   * The interval in milliseconds for sending heartbeat pings to check for
   * connection liveness.
   * @default 5000
   */
  heartbeatInterval?: number;

  /**
   * The timeout in milliseconds to wait for a `pong` response after sending
   * a `ping`. If a pong is not received, the connection is considered dead.
   * @default 10000
   */
  heartbeatTimeout?: number;

  /**
   * The timeout in milliseconds for retransmitting an unacknowledged data packet.
   * This determines how long the sender waits for an `ack` before assuming a
   * packet was lost.
   * @default 2000
   */
  ackTimeout?: number;

  /**
   * The maximum number of unacknowledged packets that can be in flight at any
   * given time. This defines the size of the sender's sliding window and is
   * the primary mechanism for flow control.
   * @default 64
   */
  sendWindowSize?: number;

  /**
   * The maximum number of out-of-order packets that can be buffered on the
   * receiving end. This defines the size of the receiver's buffer for
   * re-sequencing incoming packets.
   * @default 128
   */
  receiveBufferSize?: number;
}

/**
 * Defines the internal operational status of a multiplexed channel.
 * @internal
 */
export enum ChannelStatus {
  /**
   * The initial state before the channel handshake is complete. In this state,
   * the send window is limited to `PRE_HANDSHAKE_WINDOW_SIZE` to allow for
   * speculative sending.
   */
  PRE_HANDSHAKE,
  /**
   * The state after the handshake is complete (`open-stream-ack` is sent or
   * received). The channel operates with the full `sendWindowSize`.
   */
  ESTABLISHED,
}