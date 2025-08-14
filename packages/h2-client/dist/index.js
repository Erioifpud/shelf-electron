"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Http2ClientTransport: () => Http2ClientTransport,
  client: () => client
});
module.exports = __toCommonJS(index_exports);
var http2 = __toESM(require("http2"));

// src/transport.ts
var import_http2 = require("http2");
var import_h22 = require("@eleplug/h2");

// src/channel.ts
var import_serbin = __toESM(require("@eleplug/serbin"));
var import_h2 = require("@eleplug/h2");
var H2ClientControlChannel = class extends import_h2.H2ChannelBase {
  messageEvents = new import_h2.AsyncEventEmitter();
  constructor(stream) {
    const parser = new import_h2.FrameParser();
    super(stream, parser);
    stream.pipe(parser);
    parser.on("data", async (frame) => {
      try {
        const parsed = import_serbin.default.from(frame);
        if ((0, import_h2.isServerSignal)(parsed)) {
          await this.messageEvents.emitAsync("signal", parsed);
        } else {
          await this.messageEvents.emitAsync("message", parsed);
        }
      } catch (err) {
        this.parser.destroy(err);
      }
    });
  }
  send(data) {
    const payload = Buffer.from(import_serbin.default.byteify(data));
    return this.sendFrame(payload);
  }
  /**
   * Internal helper to enforce the replacement semantic for message handlers.
   * @private
   */
  _setListener(handler, once) {
    this.messageEvents.removeAllListeners("message");
    const eventHandler = once ? this.messageEvents.once.bind(this.messageEvents) : this.messageEvents.on.bind(this.messageEvents);
    eventHandler("message", handler);
  }
  onMessage(handler) {
    this._setListener(handler, false);
  }
  onceMessage(handler) {
    this._setListener(handler, true);
  }
  /**
   * Registers a handler for server-sent signals. This is used internally
   * by the `Http2ClientTransport` to react to server commands.
   * @internal
   */
  onSignal(handler) {
    this.messageEvents.on("signal", handler);
  }
};
var H2ClientStreamChannel = class extends import_h2.H2ChannelBase {
  id;
  dataEvents = new import_h2.AsyncEventEmitter();
  constructor(stream, channelId) {
    const parser = new import_h2.FrameParser();
    super(stream, parser);
    this.id = channelId;
    stream.pipe(parser);
    parser.on("data", async (frame) => {
      try {
        const message = import_serbin.default.from(frame);
        await this.dataEvents.emitAsync("data", message);
      } catch (err) {
        this.parser.destroy(err);
      }
    });
  }
  send(chunk) {
    const payload = Buffer.from(import_serbin.default.byteify(chunk));
    return this.sendFrame(payload);
  }
  /**
   * Internal helper to enforce the replacement semantic for data handlers.
   * @private
   */
  _setListener(handler, once) {
    this.dataEvents.removeAllListeners("data");
    const eventHandler = once ? this.dataEvents.once.bind(this.dataEvents) : this.dataEvents.on.bind(this.dataEvents);
    eventHandler("data", handler);
  }
  onData(handler) {
    this._setListener(handler, false);
  }
  onceData(handler) {
    this._setListener(handler, true);
  }
};

// src/transport.ts
var Http2ClientTransport = class {
  constructor(session) {
    this.session = session;
    this.closePromise = new Promise((resolve) => {
      this.resolveClosePromise = resolve;
    });
    this.setupSessionListeners();
  }
  events = new import_h22.AsyncEventEmitter();
  onIncomingStreamHandler = null;
  state = 0 /* OPEN */;
  controlChannelPromise = null;
  /** A promise that resolves when the transport is fully closed. */
  closePromise;
  resolveClosePromise;
  /**
   * Sets up listeners for critical session events to manage the transport lifecycle.
   * @internal
   */
  setupSessionListeners() {
    this.session.once("close", () => {
      const reason = this.state === 1 /* CLOSING */ ? void 0 : new Error("HTTP/2 session closed unexpectedly.");
      this.performFinalCleanup(reason);
    });
    this.session.once("error", (err) => {
      this.performFinalCleanup(err);
    });
    this.session.on("goaway", (errorCode, _lastStreamID, opaqueData) => {
      if (errorCode === import_http2.constants.NGHTTP2_NO_ERROR) {
        return;
      }
      const reasonText = opaqueData?.length > 0 ? opaqueData.toString() : `GOAWAY received with error code ${errorCode}`;
      this.performFinalCleanup(new Error(reasonText));
    });
  }
  /**
   * The single, idempotent entry point for all transport shutdown logic.
   * This ensures cleanup happens exactly once and emits the final 'close' event.
   * @internal
   */
  performFinalCleanup(reason) {
    if (this.state === 2 /* CLOSED */) return;
    this.state = 2 /* CLOSED */;
    this.controlChannelPromise?.catch(() => {
    });
    this.controlChannelPromise = null;
    this.events.emit("close", reason);
    this.events.removeAllListeners();
    if (!this.session.destroyed) {
      this.session.destroy(reason);
    }
    this.resolveClosePromise();
  }
  // #region Public API (Transport Interface Implementation)
  getControlChannel() {
    if (this.state !== 0 /* OPEN */) {
      return Promise.reject(new Error("Transport is not open."));
    }
    if (this.controlChannelPromise) {
      return this.controlChannelPromise;
    }
    const promise = new Promise((resolve, reject) => {
      if (this.session.destroyed || this.session.closed) {
        return reject(new Error("HTTP/2 session is already closed."));
      }
      const stream = this.session.request({
        ":method": "POST",
        ":path": import_h22.CONTROL_PATH
      });
      const onError = (err) => {
        stream.removeListener("response", onResponse);
        reject(err);
      };
      const onResponse = (headers) => {
        stream.removeListener("error", onError);
        if (headers[":status"] !== 200) {
          const err = new Error(
            `Server rejected control channel with status ${headers[":status"]}`
          );
          if (!stream.destroyed) stream.destroy(err);
          return reject(err);
        }
        const channel = new H2ClientControlChannel(stream);
        channel.onSignal((signal) => this.handleServerSignal(signal));
        channel.onClose((channelReason) => {
          if (this.state === 0 /* OPEN */) {
            const transportError = channelReason ?? new Error("Control channel closed unexpectedly.");
            this.performFinalCleanup(transportError);
          }
        });
        resolve(channel);
      };
      stream.once("error", onError);
      stream.once("response", onResponse);
    });
    this.controlChannelPromise = promise;
    promise.catch(() => {
      if (this.controlChannelPromise === promise) {
        this.controlChannelPromise = null;
      }
    });
    return promise;
  }
  openOutgoingStreamChannel() {
    if (this.state !== 0 /* OPEN */) {
      return Promise.reject(new Error("Transport is not open."));
    }
    return new Promise((resolve, reject) => {
      const stream = this.session.request({
        ":method": "POST",
        ":path": import_h22.STREAM_PATH
      });
      stream.on("response", (headers) => {
        if (headers[":status"] !== 200) {
          const err = new Error(
            `Server rejected stream channel with status ${headers[":status"]}`
          );
          if (!stream.destroyed) stream.destroy(err);
          return reject(err);
        }
        const channelId = String(stream.id);
        const channel = new H2ClientStreamChannel(stream, channelId);
        resolve(channel);
      });
      stream.once("error", reject);
    });
  }
  onIncomingStreamChannel(handler) {
    this.onIncomingStreamHandler = handler;
  }
  onClose(handler) {
    this.events.on("close", handler);
  }
  close() {
    if (this.state === 2 /* CLOSED */) {
      return this.closePromise;
    }
    if (this.state === 0 /* OPEN */) {
      this.state = 1 /* CLOSING */;
      if (!this.session.closed) {
        this.session.close();
      }
    }
    return this.closePromise;
  }
  abort(reason) {
    if (this.state === 2 /* CLOSED */) {
      return this.closePromise;
    }
    this.performFinalCleanup(reason);
    return this.closePromise;
  }
  // #endregion
  // #region Internal Signal Handling
  /**
   * Processes signals received from the server on the control channel.
   * @internal
   */
  handleServerSignal(signal) {
    if (this.state !== 0 /* OPEN */) return;
    if (signal.type === "open-stream-request") {
      this.handleOpenStreamRequest(signal.channelId);
    }
  }
  /**
   * Handles a server's request to open a new stream channel by creating a new
   * outgoing request that the server can correlate.
   * @internal
   */
  handleOpenStreamRequest(channelId) {
    if (this.state !== 0 /* OPEN */) return;
    const handler = this.onIncomingStreamHandler;
    if (!handler) {
      console.error(
        `[H2-Client] Server requested to open stream ${channelId}, but no handler is registered via onIncomingStreamChannel. Ignoring.`
      );
      return;
    }
    const stream = this.session.request({
      ":method": "POST",
      ":path": import_h22.STREAM_PATH,
      [import_h22.INITIATING_CHANNEL_ID_HEADER]: channelId
    });
    stream.on("response", (headers) => {
      if (headers[":status"] !== 200) {
        console.error(
          `[H2-Client] Server rejected our attempt to open server-initiated stream ${channelId}. Status: ${headers[":status"]}`
        );
        if (!stream.destroyed) stream.destroy();
        return;
      }
      const channel = new H2ClientStreamChannel(stream, channelId);
      try {
        Promise.resolve(handler(channel)).catch((err) => {
          console.error(
            `[H2-Client] Error in onIncomingStreamChannel handler for channel ${channelId}:`,
            err
          );
          channel.close();
        });
      } catch (err) {
        console.error(
          `[H2-Client] Synchronous error in onIncomingStreamChannel handler for channel ${channelId}:`,
          err
        );
        channel.close();
      }
    });
    stream.once("error", (err) => {
      console.error(
        `[H2-Client] Error on server-initiated stream for channel ${channelId}:`,
        err
      );
    });
  }
  // #endregion
};

// src/index.ts
var ClientBuilder = class {
  /**
   * @param authority The URL of the server to connect to (e.g., 'https://localhost:8080').
   * @param options Optional Node.js `http2.connect` options, for things like
   * custom CAs, client certificates, or other TLS/TCP settings.
   */
  constructor(authority, options) {
    this.authority = authority;
    this.options = options;
  }
  /**
   * Initiates the connection to the remote server and establishes the transport.
   *
   * @returns A promise that resolves with the fully connected and ready-to-use
   * `Http2Transport` instance, or rejects if the connection fails (e.g., due
   * to network error, TLS handshake failure, or server not listening).
   */
  connect() {
    return new Promise((resolve, reject) => {
      const session = http2.connect(this.authority, this.options);
      const onConnect = () => {
        session.removeListener("error", onError);
        const transport = new Http2ClientTransport(session);
        resolve(transport);
      };
      const onError = (err) => {
        session.removeListener("connect", onConnect);
        reject(err);
      };
      session.once("connect", onConnect);
      session.once("error", onError);
    });
  }
};
function client(authority, options) {
  return new ClientBuilder(authority, options);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Http2ClientTransport,
  client
});
