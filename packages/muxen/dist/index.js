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
  CONTROL_CHANNEL_ID: () => CONTROL_CHANNEL_ID,
  DuplexTransport: () => DuplexTransport,
  PRE_HANDSHAKE_WINDOW_SIZE: () => PRE_HANDSHAKE_WINDOW_SIZE,
  createDuplexTransport: () => createDuplexTransport,
  isChannelPacket: () => isChannelPacket,
  isHeartbeatPacket: () => isHeartbeatPacket,
  isMultiplexedPacket: () => isMultiplexedPacket
});
module.exports = __toCommonJS(index_exports);

// src/transport.ts
var import_transport5 = require("@eleplug/transport");
var import_uuid = require("uuid");

// src/channel.ts
var import_transport3 = require("@eleplug/transport");

// src/protocol.ts
var CONTROL_CHANNEL_ID = "__control__";
var PRE_HANDSHAKE_WINDOW_SIZE = 8;
function isChannelPacket(value) {
  if (typeof value !== "object" || value === null || typeof value.channelId !== "string") {
    return false;
  }
  switch (value.type) {
    case "data":
      return typeof value.seq === "number" && "payload" in value;
    case "ack":
      return typeof value.ackSeq === "number";
    case "open-stream":
    case "open-stream-ack":
    case "close-channel":
      return true;
    default:
      return false;
  }
}
function isHeartbeatPacket(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return value.type === "ping" || value.type === "pong";
}
function isMultiplexedPacket(value) {
  return isChannelPacket(value) || isHeartbeatPacket(value);
}

// src/receiver.ts
var import_transport = require("@eleplug/transport");
var ChannelReceiver = class {
  constructor(channelId, muxer, options) {
    this.channelId = channelId;
    this.muxer = muxer;
    this.options = options;
    this.receiveSlots = new Array(this.options.receiveBufferSize).fill(null);
  }
  events = new import_transport.AsyncEventEmitter();
  nextReceiveSeq = 0;
  receiveSlots;
  /** Registers a handler for correctly ordered, incoming payloads. */
  onPayload(handler) {
    this.events.on("payload", handler);
  }
  /**
   * Processes an incoming data packet from the wire. This is the main entry
   * point for the receiver's logic.
   * @param packet The data packet received from the Muxer.
   */
  handleDataPacket(packet) {
    this.muxer.sendPacket({ type: "ack", channelId: this.channelId, ackSeq: packet.seq }).catch(
      (err) => console.error(
        `[muxen] Failed to send ACK for seq=${packet.seq} on channel ${this.channelId}:`,
        err
      )
    );
    const { seq } = packet;
    const { receiveBufferSize } = this.options;
    if (seq < this.nextReceiveSeq) {
      return;
    }
    const windowEnd = this.nextReceiveSeq + receiveBufferSize;
    if (seq >= windowEnd) {
      console.warn(
        `[muxen] Packet seq=${seq} is outside the receive window [${this.nextReceiveSeq}, ${windowEnd - 1}] on channel ${this.channelId}. Discarding.`
      );
      return;
    }
    const slotIndex = seq % receiveBufferSize;
    if (this.receiveSlots[slotIndex]) {
      console.warn(`[muxen] Slot collision at index ${slotIndex} on channel ${this.channelId}. Discarding packet seq=${seq}.`);
      return;
    }
    this.receiveSlots[slotIndex] = packet;
    this._slideWindowAndProcess();
  }
  /**
   * Scans the circular buffer from the `nextReceiveSeq` position, processing
   * and dispatching all available in-order packets.
   */
  _slideWindowAndProcess() {
    const { receiveBufferSize } = this.options;
    while (true) {
      const currentSlotIndex = this.nextReceiveSeq % receiveBufferSize;
      const packetToProcess = this.receiveSlots[currentSlotIndex];
      if (!packetToProcess || packetToProcess.seq !== this.nextReceiveSeq) {
        break;
      }
      this.receiveSlots[currentSlotIndex] = null;
      this._dispatchPayload(packetToProcess.payload);
      this.nextReceiveSeq++;
    }
  }
  /** Dispatches the payload to the listener. */
  _dispatchPayload(payload) {
    this.events.emitAsync("payload", payload).catch((err) => {
      console.error(
        `[muxen] Unhandled error in payload handler for channel ${this.channelId}:`,
        err
      );
    });
  }
  /** Cleans up all internal state and resources. */
  destroy() {
    this.receiveSlots.length = 0;
    this.events.removeAllListeners();
  }
};

// src/sender.ts
var import_transport2 = require("@eleplug/transport");
var ChannelSender = class {
  constructor(channelId, muxer, options, getChannelStatus) {
    this.channelId = channelId;
    this.muxer = muxer;
    this.options = options;
    this.getChannelStatus = getChannelStatus;
  }
  nextSendSeq = 0;
  unackedPackets = /* @__PURE__ */ new Map();
  events = new import_transport2.AsyncEventEmitter();
  isReady = true;
  /**
   * Sends a payload with reliability and backpressure.
   * If the sending window is full, this method will wait asynchronously until
   * space becomes available.
   * @param payload The JSON-serializable value to send.
   */
  async send(payload) {
    while (!this.isReady) {
      await new Promise((resolve) => this.events.once("ready", resolve));
    }
    const packet = {
      type: "data",
      channelId: this.channelId,
      seq: this.nextSendSeq++,
      payload
    };
    this._sendPacket(packet);
    this._updateReadyState();
  }
  /**
   * Processes an incoming acknowledgment packet from the peer.
   * @param packet The incoming ACK packet.
   */
  handleAck(packet) {
    const unacked = this.unackedPackets.get(packet.ackSeq);
    if (unacked) {
      clearTimeout(unacked.timer);
      this.unackedPackets.delete(packet.ackSeq);
      this._updateReadyState();
    }
  }
  /**
   * Checks if the sending window has space and updates the `isReady` flag.
   * If space becomes available, it emits a 'ready' event to unblock waiters.
   */
  _updateReadyState() {
    const status = this.getChannelStatus();
    const windowSize = status === 0 /* PRE_HANDSHAKE */ ? PRE_HANDSHAKE_WINDOW_SIZE : this.options.sendWindowSize;
    const hasWindowSpace = this.unackedPackets.size < windowSize;
    if (hasWindowSpace && !this.isReady) {
      this.isReady = true;
      this.events.emit("ready");
    } else {
      this.isReady = hasWindowSpace;
    }
  }
  /**
   * Sends a single data packet to the muxer and sets a retransmission timer.
   * @param packet The data packet to send.
   */
  _sendPacket(packet) {
    this.muxer.sendPacket(packet).catch((err) => {
      console.error(
        `[muxen] Muxer failed to send packet for channel ${this.channelId}:`,
        err
      );
    });
    const timer = setTimeout(
      () => this._resendPacket(packet.seq),
      this.options.ackTimeout
    );
    this.unackedPackets.set(packet.seq, { packet, timer });
  }
  /**
   * Retransmits a packet that has not been acknowledged within the timeout.
   * @param seq The sequence number of the packet to resend.
   */
  _resendPacket(seq) {
    const unacked = this.unackedPackets.get(seq);
    if (!unacked) {
      return;
    }
    console.warn(
      `[muxen] Retransmitting packet seq=${seq} on channel ${this.channelId}`
    );
    clearTimeout(unacked.timer);
    this._sendPacket(unacked.packet);
  }
  /**
   * Cleans up all internal resources, including pending timers and waiters.
   * @param _error Not used directly, but part of the destroy signature.
   */
  destroy(_error) {
    this.unackedPackets.forEach((p) => clearTimeout(p.timer));
    this.unackedPackets.clear();
    this.isReady = false;
    this.events.emit("ready");
    this.events.removeAllListeners();
  }
};

// src/channel.ts
var MuxChannelBase = class {
  constructor(id, muxer, options) {
    this.muxer = muxer;
    this.options = options;
    this.id = id;
    this.status = 0 /* PRE_HANDSHAKE */;
    this.sender = new ChannelSender(this.id, this.muxer, this.options, () => this.status);
    this.receiver = new ChannelReceiver(this.id, this.muxer, this.options);
  }
  id;
  events = new import_transport3.AsyncEventEmitter();
  _isClosed = false;
  status;
  sender;
  receiver;
  get isClosed() {
    return this._isClosed || this.muxer.isClosed;
  }
  onClose(handler) {
    this.events.on("close", handler);
  }
  /**
   * Initiates a graceful closure by sending a `close-channel` packet.
   * The actual destruction is deferred to allow the packet to be sent.
   */
  close() {
    if (this.isClosed) return Promise.resolve();
    if (this.id !== CONTROL_CHANNEL_ID) {
      this.muxer.sendPacket({ type: "close-channel", channelId: this.id }).catch(
        (err) => console.warn(
          `[muxen] Failed to send close-channel packet for ${this.id}:`,
          err.message
        )
      );
    }
    queueMicrotask(() => this.destroy());
    return Promise.resolve();
  }
  /**
   * Immediately destroys the channel and all its sub-components, cleaning
   * up all resources.
   */
  destroy(error) {
    if (this._isClosed) return;
    this._isClosed = true;
    this.sender.destroy(error);
    this.receiver.destroy();
    this.events.emit("close", error);
    this.events.removeAllListeners();
  }
  /**
   * The internal send method, delegating to the `ChannelSender`.
   */
  _send(payload) {
    if (this.isClosed) {
      return Promise.reject(new Error(`Channel ${this.id} is closed.`));
    }
    return this.sender.send(payload);
  }
  /**
   * The main packet router for an individual channel.
   * @param packet The incoming packet for this channel.
   */
  handleIncomingPacket(packet) {
    if (this.isClosed) return;
    switch (packet.type) {
      case "data":
        this.receiver.handleDataPacket(packet);
        break;
      case "ack":
        this.sender.handleAck(packet);
        break;
      case "open-stream-ack":
        this._establish();
        break;
    }
  }
  /** Moves the channel to the established state. */
  _establish() {
    if (this.status === 1 /* ESTABLISHED */) return;
    this.status = 1 /* ESTABLISHED */;
  }
  /**
   * Acknowledges an incoming channel request from a peer and moves the channel
   * to the established state.
   */
  acknowledgeAndEstablish() {
    if (this.status === 1 /* ESTABLISHED */) return;
    this.muxer.sendPacket({ type: "open-stream-ack", channelId: this.id }).catch((err) => {
      const error = new Error(
        `Failed to send open-stream-ack for channel ${this.id}`,
        { cause: err }
      );
      this.destroy(error);
    });
    this._establish();
  }
};
var DuplexControlChannel = class extends MuxChannelBase {
  /** Buffers messages that arrive before a listener is attached. */
  messageQueue = [];
  hasListener = false;
  constructor(id, muxer, options) {
    super(id, muxer, options);
    this.status = 1 /* ESTABLISHED */;
    this.receiver.onPayload((payload) => this._receivePayload(payload));
  }
  _receivePayload(payload) {
    if (this.hasListener) {
      this.events.emitAsync("data", payload).catch((err) => this.destroy(err));
    } else {
      this.messageQueue.push(payload);
    }
  }
  /** Enforces a single-listener, replacement semantic for `onMessage`. */
  _setListener(handler, once) {
    this.events.removeAllListeners("data");
    const eventHandler = once ? this.events.once.bind(this.events) : this.events.on.bind(this.events);
    eventHandler("data", handler);
    this.hasListener = true;
    if (this.messageQueue.length > 0) {
      const queue = this.messageQueue;
      this.messageQueue = [];
      queue.forEach((p) => this._receivePayload(p));
    }
  }
  send(data) {
    return this._send(data);
  }
  onMessage(handler) {
    this._setListener(handler, false);
  }
  onceMessage(handler) {
    this._setListener(handler, true);
  }
};
var DuplexStreamChannel = class extends MuxChannelBase {
  constructor(id, muxer, options) {
    super(id, muxer, options);
    this.receiver.onPayload((payload) => {
      this.events.emitAsync("data", payload).catch((err) => this.destroy(err));
    });
  }
  /** Enforces a single-listener, replacement semantic for `onData`. */
  _setListener(handler, once) {
    this.events.removeAllListeners("data");
    const eventHandler = once ? this.events.once.bind(this.events) : this.events.on.bind(this.events);
    eventHandler("data", handler);
  }
  send(chunk) {
    return this._send(chunk);
  }
  onData(handler) {
    this._setListener(handler, false);
  }
  onceData(handler) {
    this._setListener(handler, true);
  }
};

// src/muxer.ts
var import_transport4 = require("@eleplug/transport");
var Muxer = class extends import_transport4.AsyncEventEmitter {
  constructor(_link, options) {
    super();
    this._link = _link;
    this.options = options;
    this.bindLinkListeners();
    this.startHeartbeat();
  }
  _isClosed = false;
  heartbeatIntervalId = null;
  heartbeatTimeoutId = null;
  /** Binds to the message and close events of the underlying link. */
  bindLinkListeners() {
    this._link.onMessage(this.handleMessage.bind(this));
    this._link.onClose(this.handleClose.bind(this));
  }
  /** Processes a raw message received from the link. */
  handleMessage(data) {
    if (this._isClosed) return;
    if (!isMultiplexedPacket(data)) {
      console.warn("[muxen] Received malformed packet, ignoring.", data);
      return;
    }
    if (data.type === "ping") {
      this.sendPacket({ type: "pong" }).catch(
        (err) => console.error("[muxen] Failed to send pong.", err)
      );
      return;
    }
    if (data.type === "pong") {
      this.handlePong();
      return;
    }
    this.emit("channelPacket", data);
  }
  /** The single, unified handler for link termination. */
  handleClose(reason) {
    if (this._isClosed) return;
    this.emit("close", reason);
    this.destroy();
  }
  get link() {
    return this._link;
  }
  get isClosed() {
    return this._isClosed;
  }
  /** Sends a multiplexed packet over the underlying link. */
  sendPacket(packet) {
    if (this._isClosed) {
      return Promise.reject(new Error("Muxer is closed. Cannot send packet."));
    }
    try {
      return Promise.resolve(this._link.sendMessage(packet));
    } catch (error) {
      return Promise.reject(error);
    }
  }
  // #region Heartbeating Logic
  startHeartbeat() {
    if (this._isClosed) return;
    this.stopHeartbeat();
    this.heartbeatIntervalId = setInterval(
      () => this.sendPing(),
      this.options.heartbeatInterval
    );
  }
  stopHeartbeat() {
    if (this.heartbeatIntervalId) clearInterval(this.heartbeatIntervalId);
    if (this.heartbeatTimeoutId) clearTimeout(this.heartbeatTimeoutId);
    this.heartbeatIntervalId = null;
    this.heartbeatTimeoutId = null;
  }
  sendPing() {
    if (this._isClosed) return;
    this.heartbeatTimeoutId = setTimeout(() => {
      const timeoutError = new Error(
        `Heartbeat timeout: No pong received within ${this.options.heartbeatTimeout}ms.`
      );
      this.handleClose(timeoutError);
    }, this.options.heartbeatTimeout);
    this.sendPacket({ type: "ping" }).catch((err) => {
      const sendError = new Error("Heartbeat failed: Could not send ping.", {
        cause: err
      });
      this.handleClose(sendError);
    });
  }
  handlePong() {
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId);
      this.heartbeatTimeoutId = null;
    }
  }
  // #endregion
  /**
   * Destroys the muxer, cleaning up all internal resources like timers
   * and event listeners. This is the final step in the shutdown process.
   */
  destroy() {
    if (this._isClosed) return;
    this._isClosed = true;
    this.stopHeartbeat();
    this.removeAllListeners();
  }
};

// src/transport.ts
var defaultOptions = {
  heartbeatInterval: 5e3,
  heartbeatTimeout: 1e4,
  ackTimeout: 2e3,
  sendWindowSize: 64,
  receiveBufferSize: 128
};
var DuplexTransport = class {
  events = new import_transport5.AsyncEventEmitter();
  muxer;
  options;
  channels = /* @__PURE__ */ new Map();
  _onIncomingStreamChannelHandler = null;
  _isClosed = false;
  controlChannel = null;
  constructor(link, options) {
    this.options = { ...defaultOptions, ...options };
    this.muxer = new Muxer(link, this.options);
    this.bindMuxerListeners();
  }
  /**
   * Binds the transport's packet and lifecycle handlers to the Muxer.
   * @internal
   */
  bindMuxerListeners() {
    this.muxer.on("channelPacket", (packet) => this.handlePacket(packet));
    this.muxer.on("close", (reason) => this.finalCleanup(reason));
  }
  /**
   * The main packet router for the transport. It receives all channel-related
   * packets from the Muxer and routes them to the correct channel instance
   * or handles channel lifecycle packets.
   * @internal
   */
  handlePacket(packet) {
    if (this._isClosed) return;
    if (packet.channelId === CONTROL_CHANNEL_ID) {
      this._getOrCreateControlChannel().handleIncomingPacket(
        packet
      );
      return;
    }
    if (packet.type === "close-channel") {
      const channelToClose = this.channels.get(packet.channelId);
      if (channelToClose) {
        const reason = packet.reason ? new Error(`Channel closed by remote: ${String(packet.reason)}`) : void 0;
        channelToClose.destroy(reason);
      }
      return;
    }
    const existingChannel = this.channels.get(packet.channelId);
    if (existingChannel) {
      existingChannel.handleIncomingPacket(
        packet
      );
    } else {
      if (packet.type === "open-stream" || packet.type === "data") {
        const channel = this._createIncomingStream(packet.channelId);
        if (packet.type === "open-stream") {
          channel.acknowledgeAndEstablish();
        }
        if (packet.type === "data") {
          channel.handleIncomingPacket(packet);
        }
      } else {
        console.warn(
          `[muxen] Received packet of type '${packet.type}' for unknown channel ${packet.channelId}. Ignoring.`
        );
      }
    }
  }
  /**
   * Creates and registers a new incoming stream channel upon request from a peer.
   * @internal
   */
  _createIncomingStream(channelId) {
    const streamChannel = new DuplexStreamChannel(
      channelId,
      this.muxer,
      this.options
    );
    this.channels.set(channelId, streamChannel);
    streamChannel.onClose(() => {
      this.channels.delete(channelId);
    });
    if (this._onIncomingStreamChannelHandler) {
      Promise.resolve(this._onIncomingStreamChannelHandler(streamChannel)).catch(
        (err) => {
          console.error(
            `[muxen] Error in onIncomingStreamChannel handler for ${channelId}, closing channel.`,
            err
          );
          streamChannel.close();
        }
      );
    } else {
      console.warn(
        `[muxen] Incoming stream ${channelId} opened, but no handler was registered via onIncomingStreamChannel. Closing it.`
      );
      streamChannel.close();
    }
    return streamChannel;
  }
  /**
   * The final, idempotent cleanup logic for the entire transport. This is
   * triggered when the underlying link closes.
   * @internal
   */
  finalCleanup(reason) {
    if (this._isClosed) return;
    this._isClosed = true;
    const cleanupError = reason ?? new Error("Transport closed gracefully.");
    this.channels.forEach((ch) => ch.destroy(cleanupError));
    this.channels.clear();
    this.controlChannel?.destroy(cleanupError);
    this.controlChannel = null;
    this.events.emitSerial("close", reason);
    this.muxer.destroy();
    this.events.removeAllListeners();
  }
  /**
   * Lazily creates the singleton control channel on first access.
   * @internal
   */
  _getOrCreateControlChannel() {
    if (!this.controlChannel || this.controlChannel.isClosed) {
      this.controlChannel = new DuplexControlChannel(
        CONTROL_CHANNEL_ID,
        this.muxer,
        this.options
      );
    }
    return this.controlChannel;
  }
  // #region Transport Interface Implementation
  getControlChannel() {
    if (this._isClosed) {
      return Promise.reject(new Error("Transport is closed."));
    }
    return Promise.resolve(this._getOrCreateControlChannel());
  }
  openOutgoingStreamChannel() {
    if (this._isClosed) {
      return Promise.reject(new Error("Transport is closed."));
    }
    const channelId = (0, import_uuid.v4)();
    const channel = new DuplexStreamChannel(
      channelId,
      this.muxer,
      this.options
    );
    this.channels.set(channelId, channel);
    channel.onClose(() => {
      this.channels.delete(channelId);
    });
    this.muxer.sendPacket({ type: "open-stream", channelId }).catch((err) => channel.destroy(err));
    return Promise.resolve(channel);
  }
  onIncomingStreamChannel(handler) {
    this._onIncomingStreamChannelHandler = handler;
  }
  onClose(handler) {
    this.events.on("close", handler);
  }
  close() {
    if (this._isClosed) return Promise.resolve();
    return this.muxer.link.close();
  }
  abort(reason) {
    if (this._isClosed) return Promise.resolve();
    return this.muxer.link.abort(reason);
  }
  // #endregion
};

// src/index.ts
function createDuplexTransport(link, options) {
  return new DuplexTransport(link, options);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CONTROL_CHANNEL_ID,
  DuplexTransport,
  PRE_HANDSHAKE_WINDOW_SIZE,
  createDuplexTransport,
  isChannelPacket,
  isHeartbeatPacket,
  isMultiplexedPacket
});
