"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AsyncEventEmitter: () => import_transport2.AsyncEventEmitter,
  CONTROL_PATH: () => CONTROL_PATH,
  FrameParser: () => FrameParser,
  H2ChannelBase: () => H2ChannelBase,
  INITIATING_CHANNEL_ID_HEADER: () => INITIATING_CHANNEL_ID_HEADER,
  STREAM_PATH: () => STREAM_PATH,
  isServerSignal: () => isServerSignal
});
module.exports = __toCommonJS(index_exports);

// src/constants.ts
var CONTROL_PATH = "/erpc/control";
var STREAM_PATH = "/erpc/stream";
var INITIATING_CHANNEL_ID_HEADER = "x-erpc-channel-id";

// src/framing.ts
var import_stream = require("stream");
var FrameParser = class extends import_stream.Transform {
  buffer = Buffer.alloc(0);
  expectedFrameSize = null;
  constructor() {
    super({ readableHighWaterMark: 16 * 1024 });
  }
  /**
   * The internal implementation of the transform logic, called by the stream
   * runtime whenever a new chunk of data is available from the upstream source.
   * @param chunk A chunk of raw data from the source stream.
   * @param _encoding The encoding of the chunk (ignored, we work with Buffers).
   * @param callback A function to be called when processing of the current
   * chunk is complete. This signals readiness for the next chunk.
   */
  _transform(chunk, _encoding, callback) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    try {
      while (true) {
        if (this.expectedFrameSize === null) {
          if (this.buffer.length < 4) {
            break;
          }
          this.expectedFrameSize = this.buffer.readUInt32BE(0);
          this.buffer = this.buffer.subarray(4);
        }
        if (this.buffer.length < this.expectedFrameSize) {
          break;
        }
        const framePayload = this.buffer.subarray(0, this.expectedFrameSize);
        this.buffer = this.buffer.subarray(this.expectedFrameSize);
        this.expectedFrameSize = null;
        this.push(framePayload);
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }
  /**
   * Called by the stream runtime when the upstream source has ended.
   * This method ensures that the stream ends in a clean state.
   * @param callback A function to call when flushing is complete.
   */
  _flush(callback) {
    if (this.buffer.length > 0) {
      callback(new Error("Stream ended with incomplete frame data."));
    } else {
      callback();
    }
  }
};

// src/channel.ts
var import_transport = require("@eleplug/transport");
function isServerSignal(data) {
  const d = data;
  return d && d._h2_signal_ === true && typeof d.type === "string";
}
var H2ChannelBase = class {
  /**
   * @param stream The underlying Node.js HTTP/2 stream.
   * @param parser The `FrameParser` instance that will consume data from the stream.
   */
  constructor(stream, parser) {
    this.stream = stream;
    this.parser = parser;
    this.parser.once("error", (err) => this.handleStreamClose(err));
    this.parser.once("close", () => this.handleStreamClose());
    this.stream.once("error", (err) => this.handleStreamClose(err));
    this.stream.once("close", () => this.handleStreamClose());
  }
  events = new import_transport.AsyncEventEmitter();
  /** Indicates whether the channel has been closed. */
  get isClosed() {
    return this._isClosed || this.stream.destroyed;
  }
  _isClosed = false;
  /**
   * Central, idempotent handler for stream closure. This ensures that cleanup
   * logic runs exactly once, regardless of which event triggered it.
   * @internal
   */
  handleStreamClose(err) {
    if (this._isClosed) return;
    this._isClosed = true;
    this.events.emit("close", err);
    this.events.removeAllListeners();
    if (!this.stream.destroyed) {
      this.stream.destroy(err);
    }
    if (!this.parser.destroyed) {
      this.parser.destroy(err);
    }
  }
  onClose(handler) {
    this.events.on("close", handler);
  }
  close() {
    if (this.isClosed) {
      return Promise.resolve();
    }
    if (!this.stream.destroyed) {
      this.stream.end();
    }
    return Promise.resolve();
  }
  /**
   * Sends a payload as a single length-prefixed frame. This method correctly
   * handles stream backpressure.
   * @param payload The raw data to send in the frame.
   * @returns A promise that resolves when the data has been successfully
   * written or buffered, or rejects on error.
   */
  sendFrame(payload) {
    if (this.isClosed) {
      return Promise.reject(new Error("Channel is closed."));
    }
    const frame = Buffer.alloc(4 + payload.length);
    frame.writeUInt32BE(payload.length, 0);
    payload.copy(frame, 4);
    return new Promise((resolve, reject) => {
      if (this.stream.destroyed) {
        return reject(new Error("Stream was destroyed before writing."));
      }
      const writeCallback = (err) => {
        if (err) {
          reject(err);
        }
      };
      const canContinueImmediately = this.stream.write(frame, writeCallback);
      if (canContinueImmediately) {
        resolve();
      } else {
        const onDrain = () => {
          this.stream.removeListener("error", onError);
          resolve();
        };
        const onError = (err) => {
          this.stream.removeListener("drain", onDrain);
          reject(err);
        };
        this.stream.once("drain", onDrain);
        this.stream.once("error", onError);
      }
    });
  }
};

// src/index.ts
var import_transport2 = require("@eleplug/transport");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AsyncEventEmitter,
  CONTROL_PATH,
  FrameParser,
  H2ChannelBase,
  INITIATING_CHANNEL_ID_HEADER,
  STREAM_PATH,
  isServerSignal
});
