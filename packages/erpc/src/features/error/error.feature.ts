import type { Feature } from "../../runtime/framework/feature.js";
import type { SerializationContribution } from "../serialization/serialization.feature.js";
import { errorHandler } from "./error.handler.js";
import { illegalTypeErrorHandler } from "./illegal-type-error.handler.js";

type ErrorHandlingRequires = SerializationContribution;

/**
 * A built-in feature that provides serialization support for Error objects.
 *
 * This feature ensures that standard `Error` instances and custom erpc errors
 * (like `IllegalParameterError`) can be correctly transmitted between peers,
 * preserving their name, message, and stack trace.
 */
export class ErrorHandlingFeature
  implements Feature<{}, ErrorHandlingRequires>
{
  public contribute(): {} {
    // This feature contributes no new runtime capabilities.
    return {};
  }

  /**
   * Initializes the feature by registering its type handlers with the
   * serialization service.
   */
  public init(capability: ErrorHandlingRequires): void {
    capability.serializer.registerHandler(errorHandler);
    capability.serializer.registerHandler(illegalTypeErrorHandler);
  }

  public close(): void {
    // This feature is stateless and requires no cleanup.
  }
}
