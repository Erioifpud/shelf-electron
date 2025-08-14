// h2/index.ts (重构后)
export {
  CONTROL_PATH,
  INITIATING_CHANNEL_ID_HEADER,
  STREAM_PATH,
} from './constants.js';
export { FrameParser } from './framing.js';
export { H2ChannelBase, isServerSignal } from './channel.js';

export type { ServerSignal } from './channel.js';
export type { Http2Transport } from './transport.js';

// Re-export core types from transport for convenience
export { AsyncEventEmitter } from '@eleplug/transport';
export type {
  BaseChannel,
  ChannelId,
  ControlChannel,
  IncomingStreamChannel,
  OutgoingStreamChannel,
  StreamChannel,
  JsonValue,
  MaybePromise,
} from '@eleplug/transport';