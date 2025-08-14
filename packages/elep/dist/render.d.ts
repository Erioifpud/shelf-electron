import { Pin } from '@eleplug/erpc';
export * from '@eleplug/erpc';
import { BrowserWindow } from 'electron';
import { Transport } from '@eleplug/transport';
export * from '@eleplug/transport';
import { System } from '@eleplug/esys';
export * from '@eleplug/esys';
import { C as Convert, I as IpcShape } from './types-D8kZ49Qq.js';
import { Link, MultiplexedPacket } from '@eleplug/muxen';
export * from '@eleplug/muxen';
export * from '@eleplug/anvil';
export * from '@eleplug/ebus';

/**
 * A secure wrapper around an Electron `BrowserWindow` instance.
 *
 * This class is designed to be "pin-able" via `erpc`, allowing core systems or
 * other plugins to safely perform actions on a window without having direct
- * access to the powerful, and potentially insecure, `BrowserWindow` object.
 * It manages its own lifecycle and the lifecycle of transports connected to its
 * renderer process.
 */
declare class EWindow {
    private readonly window;
    private readonly transports;
    private isDestroyed;
    /**
     * @param window The raw `BrowserWindow` instance to wrap and manage.
     */
    constructor(window: BrowserWindow);
    /**
     * Central cleanup logic for this EWindow instance.
     * This method is called when the underlying BrowserWindow is closed, and it
     * ensures all associated transports are gracefully shut down. It is idempotent.
     */
    private cleanup;
    /**
     * Opens a named, multiplexed transport channel to this window's renderer process.
     * If a transport with the same namespace already exists, it returns the existing instance.
     * This is the primary bridge for all `erpc` and `ebus` communication.
     *
     * @param namespace A unique name for the transport channel (e.g., 'my-plugin-rpc').
     * @returns A `Transport` instance. Note that `Transport` itself is a pin-able type,
     *          allowing it to be passed to other plugins.
     * @throws An `Error` if the window has already been destroyed.
     */
    openTransport(namespace: string): Transport;
    /**
     * Opens the DevTools for this window's web contents.
     * @throws An `Error` if the window has been destroyed.
     */
    openDevTools(): void;
    /**
     * Loads a URL (including `http://`, `file://`, or `plugin://`) into the window.
     * This is a proxy to `BrowserWindow.loadURL`.
     * @param url The URL to load.
     * @throws An `Error` if the window has been destroyed.
     */
    loadURL(url: string): Promise<void>;
    /**
     * Gets the current title of the window.
     * @returns The window title.
     * @throws An `Error` if the window has been destroyed.
     */
    getTitle(): string;
    /**
     * Brings the window to the front and gives it focus.
     * @throws An `Error` if the window has been destroyed.
     */
    focus(): void;
    /**
     * Shows the window if it is currently hidden.
     * @throws An `Error` if the window has been destroyed.
     */
    show(): void;
    /**
     * Closes the window. This is an idempotent operation.
     */
    closeWindow(): void;
}

/**
 * Represents a primitive value that is directly serializable to JSON.
 *
 * @remarks
 * This type definition includes special considerations:
 * - `Uint8Array` is included to natively support binary payloads. It is expected
 *   that a higher-level serialization layer (e.g., one with custom transformers)
 *   will handle its conversion, often to a Base64 string.
 * - `bigint` is explicitly excluded as it lacks a standard JSON representation and
 *   requires deliberate conversion (e.g., to a string) before serialization.
 */
type JsonPrimitive = string | number | boolean | null | undefined | Uint8Array;
/**
 * Represents a JSON-serializable array, where each element is a valid `JsonValue`.
 */
type JsonArray = JsonValue[];
/**
 * Represents a JSON-serializable object, mapping string keys to valid `JsonValue` types.
 */
type JsonObject = {
    [key: string]: JsonValue;
};
/**
 * Represents any value that can be losslessly converted to a JSON string
 * and back again. This is the universal type for all data payloads exchanged
 * over the transport layer.
 */
type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * Defines the configuration options for the `ECore.createWindow()` method.
 *
 * This interface exposes a curated and secure subset of Electron's
 * `BrowserWindowConstructorOptions`. It aims to simplify the API for plugin
 * developers while enforcing security best practices by abstracting away
 * dangerous or complex settings.
 */
interface EWindowOptions extends JsonObject {
    /** The window's width in pixels. */
    width?: number;
    /** The window's height in pixels. */
    height?: number;
    /** The window's top-left corner x-position relative to the screen. */
    x?: number;
    /** The window's top-left corner y-position relative to the screen. */
    y?: number;
    /** The window's minimum allowed width. */
    minWidth?: number;
    /** The window's minimum allowed height. */
    minHeight?: number;
    /** The window's maximum allowed width. */
    maxWidth?: number;
    /** The window's maximum allowed height. */
    maxHeight?: number;
    /** The title of the window. Not visible if `frame` is `false`. */
    title?: string;
    /**
     * Whether to show the window frame, including title bar and controls.
     * Set to `false` to create borderless or custom-shaped windows.
     * @default true
     */
    frame?: boolean;
    /**
     * Specifies the title bar style for a frameless window.
     * - `default`: Standard platform-specific title bar.
     * - `hidden`: Hides the title bar but keeps window controls ("traffic lights" on macOS).
     * - `hiddenInset`: (macOS only) A variant of `hidden` with controls positioned more inset.
     */
    titleBarStyle?: "default" | "hidden" | "hiddenInset";
    /**
     * Makes the window background transparent.
     * Typically used with `frame: false` for non-rectangular windows.
     * @default false
     */
    transparent?: boolean;
    /**
     * The window's background color as a hex string (e.g., '#RRGGBB').
     * @default '#FFF' (white)
     */
    backgroundColor?: string;
    /** Path to the window's icon. Recommended for Windows and Linux. */
    icon?: string;
    /** Whether the window should be shown immediately upon creation. @default true */
    show?: boolean;
    /** Whether the user can resize the window. @default true */
    resizable?: boolean;
    /** Whether the user can move the window. @default true */
    movable?: boolean;
    /** Whether the user can minimize the window. @default true */
    minimizable?: boolean;
    /** Whether the user can maximize the window. @default true */
    maximizable?: boolean;
    /** Whether the window has a close button. @default true */
    closable?: boolean;
    /** Whether the window should always stay on top of other windows. @default false */
    alwaysOnTop?: boolean;
    /** Whether the window should open in fullscreen mode. @default false */
    fullscreen?: boolean;
    /**
     * A limited set of configurable web preferences for the window's renderer process.
     *
     * **Security Note**: Critical security options (`contextIsolation`, `sandbox`,
     * `nodeIntegration`, and the final `preload` path) are managed and enforced
     * by the Elep core. They cannot be overridden here.
     */
    webPreferences?: {
        /**
         * The `plugin://` URI that points to the preload script for the window.
         * This script is loaded securely from the plugin's resources before any
         * other web content.
         * @example "plugin://my-ui-plugin/dist/preload.js"
         */
        preload?: string;
        /** Whether to open the DevTools on window creation. */
        devTools?: boolean;
        /** An array of string arguments to append to `process.argv` in the renderer process. */
        additionalArguments?: string[];
        /** Whether to throttle animations and timers when the page is in the background. @default true */
        backgroundThrottling?: boolean;
    };
}

/**
 * Represents the core of the Electron application, acting as a proxy to the
 * `app` module and a factory for `EWindow` instances.
 *
 * This class is designed to be a singleton, created at application startup and
 * exposed to plugins as a `Pin<ECore>` object, allowing them to safely interact
 * with core application functionalities like creating windows and quitting.
 */
declare class ECore {
    private readonly system;
    private isProtocolRegistered;
    /**
     * Creates an instance of ECore.
     * @param system A reference to the main `esys` System instance, which is used
     *               to handle `plugin://` protocol requests for resource loading.
     */
    constructor(system: System);
    /**
     * Registers the custom `plugin://` protocol handler.
     * This method ensures that requests for `plugin://` URIs are intercepted and
     * resolved by fetching the corresponding resource from the `esys` system.
     * It is idempotent and safely handles being called before or after the
     * `app` 'ready' event.
     */
    private installProtocolHandler;
    /**
     * Securely streams a preload script from a plugin resource URI to a temporary
     * file on the local filesystem. This is a critical security step, as Electron's
     * `preload` option requires an absolute file path, and we must not expose
     * the application's internal file structure to plugins.
     * @param preloadUri The `plugin://` URI of the preload script to load.
     * @returns A promise that resolves to the absolute path of the temporary file.
     * @throws An error if the resource cannot be fetched or written to a temporary file.
     */
    private streamPreloadToTempFile;
    /**
     * Creates a new application window (`BrowserWindow`) managed by an `EWindow` wrapper.
     * This method provides a simplified and secure interface for plugins to create UI.
     *
     * @param options Configuration options for the window, defined by `EWindowOptions`.
     * @returns A Promise that resolves to a `Pin<EWindow>`, a remotely-accessible proxy
     *          to the newly created window.
     */
    createWindow(options?: EWindowOptions): Promise<Pin<EWindow>>;
    /**
     * Retrieves application-level process metrics, such as CPU and memory usage.
     * This is a direct proxy to Electron's `app.getAppMetrics()`.
     * @returns An array of process metric objects.
     */
    getAppMetrics(): Convert<Electron.ProcessMetric>[];
    /**
     * Gets the application's version string, as defined in `package.json`.
     * This is a direct proxy to Electron's `app.getVersion()`.
     * @returns The application version string.
     */
    getVersion(): string;
    /**
     * Shuts down the `esys` system gracefully and then quits the Electron application.
     */
    quit(): Promise<void>;
}

/**
 * An implementation of the `Link` interface for the Electron renderer process.
 * It uses a pre-configured `IpcShape` adapter to communicate with a corresponding
 * `IpcLink` in the main process over a dedicated channel.
 */
declare class IpcRendererLink implements Link {
    private readonly ipc;
    private readonly events;
    private isClosed;
    private readonly messageListener;
    /**
     * @param ipc The `IpcShape` adapter, created by `createAdapter` from the
     *            preload script, which provides namespaced communication methods.
     */
    constructor(ipc: IpcShape);
    onMessage(handler: (message: MultiplexedPacket) => void): void;
    sendMessage(packet: MultiplexedPacket): Promise<void>;
    onClose(handler: (reason?: Error) => void): void;
    close(): Promise<void>;
    abort(reason: Error): Promise<void>;
    private internalClose;
}

export { Convert, ECore, EWindow, type EWindowOptions, IpcRendererLink, IpcShape };
