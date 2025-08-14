import type { JsonObject } from "packages/transport/dist/index.mjs";

/**
 * Defines the configuration options for the `ECore.createWindow()` method.
 *
 * This interface exposes a curated and secure subset of Electron's
 * `BrowserWindowConstructorOptions`. It aims to simplify the API for plugin
 * developers while enforcing security best practices by abstracting away
 * dangerous or complex settings.
 */
export interface EWindowOptions extends JsonObject {
  // --- Sizing and Positioning ---

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

  // --- Appearance ---

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

  // --- Behavior ---

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
