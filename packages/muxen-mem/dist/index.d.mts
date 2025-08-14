import { Link } from '@eleplug/muxen';

/**
 * A utility that creates a pair of linked `MemoryLink` instances, ready to be
 * used by `createDuplexTransport` to form a client and server transport for
 * in-process testing.
 */
declare class MemoryConnector {
    /** The `Link` instance representing the client side of the connection. */
    readonly client: Link;
    /** The `Link` instance representing the server side of the connection. */
    readonly server: Link;
    constructor();
}

export { MemoryConnector };
