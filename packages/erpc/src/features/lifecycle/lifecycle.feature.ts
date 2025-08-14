import type { Feature } from "../../runtime/framework/feature";
import type { TransportAdapterContribution } from "../transport/transport.adapter.feature";

/**
 * The capabilities contributed by the `LifecycleFeature`.
 */
export interface LifecycleContribution {
  /**
   * Checks if the erpc node is in the process of shutting down.
   * Procedures can use this to reject new long-running tasks during graceful shutdown.
   * @returns `true` if the node is closing, otherwise `false`.
   */
  isClosing: () => boolean;
}

/**
 * A feature that manages the lifecycle state of the erpc node, specifically
 * its closing status.
 *
 * It provides a centralized `isClosing()` method that other parts of the system
 * can query to implement graceful shutdown behavior.
 */
export class LifecycleFeature
  implements Feature<LifecycleContribution, TransportAdapterContribution>
{
  private _isClosing = false;

  public contribute(): LifecycleContribution {
    // Contribute a function that provides live access to the closing state.
    return {
      isClosing: () => this._isClosing,
    };
  }

  public init(capability: TransportAdapterContribution): void {
    // The shutdown process can be initiated by the underlying transport closing.
    capability.rawEmitter.on("close", () => {
      this._isClosing = true;
    });
  }

  /**
   * When the erpc node's top-level `close()` method is called, this lifecycle
   * hook is triggered, marking the node as closing.
   */
  public close(_contribution: LifecycleContribution, _error?: Error): void {
    this._isClosing = true;
  }
}
