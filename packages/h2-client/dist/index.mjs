// src/index.ts
import * as http2 from "http2";

// src/transport.ts
import { constants as http2constants } from "http2";
import {
  AsyncEventEmitter as AsyncEventEmitter2,
  CONTROL_PATH,
  INITIATING_CHANNEL_ID_HEADER,
  STREAM_PATH
} from "@eleplug/h2";

// src/channel.ts
import serbin from "@eleplug/serbin";
import {
  AsyncEventEmitter,
  FrameParser,
  H2ChannelBase,
  isServerSignal
} from "@eleplug/h2";
var H2ClientControlChannel = class extends H2ChannelBase {
  messageEvents = new AsyncEventEmitter();
  constructor(stream) {
    const parser = new FrameParser();
    super(stream, parser);
    stream.pipe(parser);
    parser.on("data", async (frame) => {
      try {
        const parsed = serbin.from(frame);
        if (isServerSignal(parsed)) {
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
    const payload = Buffer.from(serbin.byteify(data));
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
var H2ClientStreamChannel = class extends H2ChannelBase {
  id;
  dataEvents = new AsyncEventEmitter();
  constructor(stream, channelId) {
    const parser = new FrameParser();
    super(stream, parser);
    this.id = channelId;
    stream.pipe(parser);
    parser.on("data", async (frame) => {
      try {
        const message = serbin.from(frame);
        await this.dataEvents.emitAsync("data", message);
      } catch (err) {
        this.parser.destroy(err);
      }
    });
  }
  send(chunk) {
    const payload = Buffer.from(serbin.byteify(chunk));
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
  events = new AsyncEventEmitter2();
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
      if (errorCode === http2constants.NGHTTP2_NO_ERROR) {
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
        ":path": CONTROL_PATH
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
        ":path": STREAM_PATH
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
      ":path": STREAM_PATH,
      [INITIATING_CHANNEL_ID_HEADER]: channelId
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
export {
  Http2ClientTransport,
  client
};
