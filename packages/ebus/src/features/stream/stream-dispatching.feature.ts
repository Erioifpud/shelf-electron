import { type Feature } from "@eleplug/erpc";
import type { DispatchContribution } from "../dispatch/dispatch.feature.js";
import { ReadableStreamDispatchHandler } from "./fanout-dispatch.handler.js";
import { WritableStreamDispatchHandler } from "./fanin-dispatch.handler.js";

/** The dependencies required by the `StreamDispatchFeature`. */
type StreamDispatchRequires = DispatchContribution;

/**
 * A specialized plugin feature that registers stream handling capabilities
 * with the core `DispatchFeature`.
 *
 * This feature is stateless and contributes no new public API. Its sole purpose
 * is to "install" the logic for correctly dispatching `ReadableStream` (fan-out)
 * and `WritableStream` (fan-in) during EBUS broadcast operations.
 */
export class StreamDispatchFeature
  implements Feature<{}, StreamDispatchRequires>
{
  /** This feature does not provide any new capabilities, so it returns an empty object. */
  public contribute(): {} {
    return {};
  }

  /**
   * During initialization, this method registers the stream-specific handlers
   * with the `DispatchFeature`.
   * @param capability The EBUS core capabilities, from which we only need
   *                   the `dispatcher.registerHandler` method.
   */
  public init(capability: StreamDispatchRequires): void {
    // Register the handler for multicasting ReadableStreams (fan-out).
    capability.dispatcher.registerHandler(ReadableStreamDispatchHandler);

    // Register the handler for aggregating WritableStreams (fan-in).
    capability.dispatcher.registerHandler(WritableStreamDispatchHandler);
  }

  /** This feature is stateless and requires no cleanup on close. */
  public close(): void {
    // No-op
  }
}
