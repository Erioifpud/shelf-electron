export { ECore, EWindow, EWindowOptions, IpcRendererLink } from './render.js';
import { Bus } from '@eleplug/ebus';
export { Bus, BusContext, ApiFactory as EbusApiFactory, Err, Node, NodeId, NodeOptions, Ok, PublisherClient, Result, Topic, TopicContext, err, initEBUS, ok } from '@eleplug/ebus';
import { Container, PluginManifest, ResourceGetResponse } from '@eleplug/esys';
export { Bootloader, Container, ContainerFactory, MemoryContainer, PluginManifest, PluginRegistryEntry, Registry, System } from '@eleplug/esys';
import { WebContents } from 'electron';
import { Link, MultiplexedPacket } from '@eleplug/muxen';
export { Link, createDuplexTransport } from '@eleplug/muxen';
export { C as Convert, I as IpcShape } from './types-D8kZ49Qq.js';
export { Plugin, PluginActivationContext, PluginApi, PluginApiMap, definePlugin } from '@eleplug/anvil';
export { Api, Client, Env, ErpcInstance, JsonValue, Pin, Pinable, ProcedureBuilder, Transferable, TransferableArray, Transport, buildClient, free, initERPC, middleware, pin } from '@eleplug/erpc';
export { DependencyGraph, DependencyResolver, DiffEntry, DiffResult, PluginMeta as PlexusPluginMeta, Provider as PlexusProvider, Requirements } from '@eleplug/plexus';
import '@eleplug/transport';

/**
 * A container that loads plugins from the local file system. Each subdirectory
 * in the root path containing a `package.json` is treated as a plugin.
 */
declare class FileContainer implements Container {
    private readonly rootPath;
    private readonly bus;
    private readonly activeNodes;
    private readonly mimeCache;
    /**
     * @param bus A reference to the system's EBUS instance.
     * @param rootPath The absolute path to the directory where plugins are stored.
     */
    constructor(bus: Bus, rootPath: string);
    plugins: {
        /**
         * Activates a plugin from the file system.
         * @param pluginPath The relative path of the plugin directory.
         */
        activate: (containerName: string, pluginPath: string) => Promise<void>;
        /**
         * Deactivates a running plugin.
         * @param pluginPath The relative path of the plugin directory.
         */
        deactivate: (pluginPath: string) => Promise<void>;
        /**
         * Reads and parses the package.json to construct a PluginManifest.
         * @param pluginPath The relative path of the plugin directory.
         * @returns A promise that resolves to the plugin's manifest.
         */
        manifest: (pluginPath: string) => Promise<PluginManifest>;
    };
    resources: {
        get: (resourcePath: string) => Promise<ResourceGetResponse>;
        put: (resourcePath: string, stream: ReadableStream) => Promise<void>;
        list: (dirPath: string) => Promise<string[]>;
    };
    close(): Promise<void>;
    private secureJoin;
    private getMimeType;
}

/**
 * An implementation of the `Link` interface for the Electron main process.
 * It establishes a dedicated communication channel with a specific renderer process
 * over a given namespace.
 */
declare class IpcLink implements Link {
    private readonly webContents;
    readonly namespace: string;
    private readonly events;
    private isClosed;
    private readonly messageListener;
    /**
     * @param webContents The `WebContents` object of the target renderer process.
     * @param namespace The unique channel name for this link.
     */
    constructor(webContents: WebContents, namespace: string);
    /**
     * Registers a handler for incoming messages from the linked renderer.
     * @param handler The function to execute when a message is received.
     */
    onMessage(handler: (message: MultiplexedPacket) => void): void;
    /**
     * Sends a message to the associated renderer process on the link's namespace.
     * @param packet The multiplexed packet to send.
     */
    sendMessage(packet: MultiplexedPacket): Promise<void>;
    /**
     * Registers a handler for when the communication link is closed.
     * @param handler The function to execute upon closing.
     */
    onClose(handler: (reason?: Error) => void): void;
    close(): Promise<void>;
    abort(reason: Error): Promise<void>;
    /**
     * Centralized cleanup logic for closing the link.
     * This is idempotent and safe to call multiple times.
     */
    private internalClose;
}

export { FileContainer, IpcLink };
