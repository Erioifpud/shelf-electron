import type { Transport } from '@eleplug/transport';

/**
 * A marker interface for an eRPC transport layer implemented over HTTP/2.
 *
 * This interface extends the base `Transport` but does not add new methods.
 * It serves as a type constraint, ensuring that HTTP/2-specific implementations
 * can be correctly identified and used by H2-aware builders and servers.
 *
 * An `Http2Transport` implementation is expected to manage the lifecycle of an
 * `Http2Session` and create `Channel`s over individual `Http2Stream` instances.
 */
export interface Http2Transport extends Transport {}