import { Transport, JsonValue, ChannelId, ControlChannel, OutgoingStreamChannel, IncomingStreamChannel, MaybePromise } from '@eleplug/transport';

/**
 * An in-memory transport implementation, ideal for testing and in-process
 * communication. It connects two `MemoryTransport` instances directly,
 * simulating a full-duplex network connection.
 */
declare class MemoryTransport implements Transport {
    private readonly events;
    private remoteTransport;
    private _isClosed;
    private controlChannel;
    private controlChannelPromise;
    private readonly streamChannels;
    /** Links this transport to its peer. @internal */
    _link(remote: MemoryTransport): void;
    /** Receives an incoming control message from the linked peer. @internal */
    _receiveControlMessage(message: JsonValue): void;
    /** Receives an incoming stream message from the linked peer. @internal */
    _receiveStreamMessage(channelId: ChannelId, message: JsonValue): void;
    /**
     * Used by a remote channel to await this side's readiness signal.
     * @internal
     */
    _getStreamChannelReadyPromise(channelId: ChannelId): Promise<void>;
    /** Lazily creates an incoming stream channel upon first message. @internal */
    private _getOrCreateStreamChannel;
    /** Closes a stream channel when signaled by the remote peer. @internal */
    _closeStreamChannel(channelId: ChannelId, reason?: Error): void;
    /** Central, idempotent cleanup logic for the transport. @internal */
    _destroy(reason?: Error): void;
    getControlChannel(): Promise<ControlChannel>;
    openOutgoingStreamChannel(): Promise<OutgoingStreamChannel>;
    onIncomingStreamChannel(handler: (channel: IncomingStreamChannel) => MaybePromise<void>): void;
    onClose(handler: (reason?: Error) => MaybePromise<void>): void;
    abort(reason: Error): Promise<void>;
    close(): Promise<void>;
}
/**
 * A utility class that creates a pair of linked `MemoryTransport` instances,
 * representing a client and a server for in-process communication.
 */
declare class MemoryConnector {
    readonly client: Transport;
    readonly server: Transport;
    constructor();
}

export { MemoryConnector, MemoryTransport };
