import type { Api } from '../../api/api.js';
import { createProcedureHandlers } from '../../api/router.js';
import type { Feature } from '../../runtime/framework/feature.js';
import type { Transferable, TransferableArray } from '../../types/common.js';
import type { LifecycleContribution } from '../lifecycle/lifecycle.feature.js';
import type { ProtocolHandlerContribution } from '../protocol/protocol.handler.feature.js';
import type { SerializationContribution } from '../serialization/serialization.feature.js';
import type { TransportAdapterContribution } from '../transport/transport.adapter.feature.js';
import type { CallManagerContribution } from './call-manager.feature.js';

type CallExecutorRequires =
  ProtocolHandlerContribution &
  SerializationContribution &
  TransportAdapterContribution &
  CallManagerContribution &
  LifecycleContribution;

/**
 * A feature that executes incoming RPC calls on the server side.
 *
 * This feature is the ultimate consumer of 'ask' and 'tell' requests. It
 * deserializes incoming arguments, invokes the appropriate procedure handler
 * for the given API, and sends back a serialized response for 'ask' calls.
 *
 * @template TApi The server's API definition.
 */
export class CallExecutorFeature<TApi extends Api<TransferableArray, Transferable>> implements Feature<{}, CallExecutorRequires> {
  private handlers: ReturnType<typeof createProcedureHandlers<TransferableArray, Transferable, TApi>>;

  /**
   * @param api The user-defined API router. The handlers are pre-built here for efficient execution.
   */
  constructor(api: TApi) {
    this.handlers = createProcedureHandlers<TransferableArray, Transferable, TApi>(api);
  }

  public contribute(): {} {
    // This feature provides no new capabilities to other features.
    return {};
  }

  public init(capability: CallExecutorRequires): void {
    const { semanticEmitter, serializer, sendRawMessage, isClosing } = capability;

    // Listen for 'ask' (request-response) calls.
    semanticEmitter.on('ask', async (message) => {
      // 1. Deserialize inputs and metadata.
      const deserializedInput = message.input.map(i => serializer.deserialize(i));
      const meta = message.meta ? serializer.deserialize(message.meta) : undefined;

      // 2. Execute the procedure handler.
      const env = { ctx: undefined, meta, isClosing };
      const result = await this.handlers.handleAsk(env, message.path, deserializedInput);

      // 3. For 'ask' calls, a response must be sent.
      if (result) {
        // 4. Serialize the output (data or error).
        const serializedOutput = serializer.serialize(result.success ? result.data : result.error);

        // 5. Send the response message.
        await sendRawMessage({
          type: 'rpc-response',
          callId: message.callId,
          success: result.success,
          output: serializedOutput,
        });
      }
    });

    // Listen for 'tell' (fire-and-forget) calls.
    semanticEmitter.on('tell', (message) => {
      const deserializedInput = message.input.map(i => serializer.deserialize(i));
      const meta = message.meta ? serializer.deserialize(message.meta) : undefined;

      const env = { ctx: undefined, meta, isClosing };
      // Execute the handler. No response is sent.
      this.handlers.handleTell(env, message.path, deserializedInput);
    });
  }

  public close(): void {
    // No-op, as this feature holds no state that needs explicit cleanup.
  }
}