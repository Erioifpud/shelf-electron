/**
 * Defines shared constants for the HTTP/2 transport implementation.
 * These values form the contract between the H2 client and server.
 */

/**
 * The HTTP/2 path (`:path` pseudo-header) used for establishing the primary
 * eRPC control channel. This channel handles all non-stream RPCs and
 * transport-level signaling.
 */
export const CONTROL_PATH = '/erpc/control';

/**
 * The HTTP/2 path (`:path` pseudo-header) used for establishing eRPC stream
 * channels. Both client-initiated and server-initiated streams use this path.
 */
export const STREAM_PATH = '/erpc/stream';

/**
 * The HTTP header used by the client to identify a stream request that was
 * initiated by a server signal.
 *
 * @remarks
 * When the server needs to open a stream, it sends a signal over the control
 * channel containing a new `channelId`. The client then makes a new HTTP/2
 * request to `STREAM_PATH` and includes this header with the `channelId` to
 * allow the server to correlate the incoming request with its original signal.
 */
export const INITIATING_CHANNEL_ID_HEADER = 'x-erpc-channel-id';