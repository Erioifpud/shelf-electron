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
  Bootloader: () => import_esys.Bootloader,
  DependencyGraph: () => import_plexus.DependencyGraph,
  DependencyResolver: () => import_plexus.DependencyResolver,
  DiffResult: () => import_plexus.DiffResult,
  ECore: () => ECore,
  EWindow: () => EWindow,
  FileContainer: () => FileContainer,
  IpcLink: () => IpcLink,
  IpcRendererLink: () => IpcRendererLink,
  MemoryContainer: () => import_esys.MemoryContainer,
  Registry: () => import_esys.Registry,
  Requirements: () => import_plexus.Requirements,
  System: () => import_esys.System,
  buildClient: () => import_erpc2.buildClient,
  createDuplexTransport: () => import_muxen2.createDuplexTransport,
  definePlugin: () => import_anvil.definePlugin,
  err: () => import_ebus2.err,
  free: () => import_erpc2.free,
  initEBUS: () => import_ebus2.initEBUS,
  initERPC: () => import_erpc2.initERPC,
  middleware: () => import_erpc2.middleware,
  ok: () => import_ebus2.ok,
  pin: () => import_erpc2.pin
});
module.exports = __toCommonJS(index_exports);

// src/core/ecore.ts
var import_electron3 = require("electron");
var import_erpc = require("@eleplug/erpc");

// src/core/ewindow.ts
var import_electron2 = require("electron");
var import_muxen = require("@eleplug/muxen");
var import_transport2 = require("@eleplug/transport");

// src/transport/ipc-link.ts
var import_mimic = __toESM(require("@eleplug/mimic"));
var import_electron = require("electron");
var import_transport = require("@eleplug/transport");
var IpcLink = class {
  /**
   * @param webContents The `WebContents` object of the target renderer process.
   * @param namespace The unique channel name for this link.
   */
  constructor(webContents, namespace) {
    this.webContents = webContents;
    this.namespace = namespace;
    if (this.webContents.isDestroyed()) {
      throw new Error("Cannot create IpcLink for a destroyed WebContents.");
    }
    this.messageListener = (event, message) => {
      if (event.sender === this.webContents) {
        const packet = import_mimic.default.parse(message);
        this.events.emit("message", packet);
      }
    };
    import_electron.ipcMain.on(this.namespace, this.messageListener);
    this.webContents.once("destroyed", () => this.close());
  }
  events = new import_transport.AsyncEventEmitter();
  isClosed = false;
  // A reference to the specific listener function is kept for proper removal.
  messageListener;
  /**
   * Registers a handler for incoming messages from the linked renderer.
   * @param handler The function to execute when a message is received.
   */
  onMessage(handler) {
    this.events.on("message", handler);
  }
  /**
   * Sends a message to the associated renderer process on the link's namespace.
   * @param packet The multiplexed packet to send.
   */
  sendMessage(packet) {
    if (this.isClosed) {
      return Promise.reject(new Error(`Link (${this.namespace}) is closed.`));
    }
    this.webContents.send(this.namespace, import_mimic.default.stringify(packet));
    return Promise.resolve();
  }
  /**
   * Registers a handler for when the communication link is closed.
   * @param handler The function to execute upon closing.
   */
  onClose(handler) {
    this.events.on("close", handler);
  }
  close() {
    return this.internalClose();
  }
  abort(reason) {
    return this.internalClose(reason);
  }
  /**
   * Centralized cleanup logic for closing the link.
   * This is idempotent and safe to call multiple times.
   */
  internalClose(reason) {
    if (this.isClosed) {
      return Promise.resolve();
    }
    this.isClosed = true;
    import_electron.ipcMain.removeListener(this.namespace, this.messageListener);
    this.events.emit("close", reason);
    this.events.removeAllListeners();
    return Promise.resolve();
  }
};

// src/core/ewindow.ts
var EWindow = class {
  /**
   * @param window The raw `BrowserWindow` instance to wrap and manage.
   */
  constructor(window) {
    this.window = window;
    this.window.once("closed", () => this.cleanup());
    this.openTransport("ebus-core");
  }
  transports = /* @__PURE__ */ new Map();
  isDestroyed = false;
  /**
   * Central cleanup logic for this EWindow instance.
   * This method is called when the underlying BrowserWindow is closed, and it
   * ensures all associated transports are gracefully shut down. It is idempotent.
   */
  cleanup() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    const allTransports = Array.from(this.transports.values());
    for (const transport of allTransports) {
      transport.close().catch((err2) => {
        console.error(`[EWindow] Error closing transport on window cleanup:`, err2);
      });
    }
    this.transports.clear();
  }
  // --- Pin-able Public API ---
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
  openTransport(namespace) {
    if (this.isDestroyed) {
      throw new Error("Cannot open transport: The window has been destroyed.");
    }
    if (this.transports.has(namespace)) {
      return this.transports.get(namespace);
    }
    const link = new IpcLink(this.window.webContents, namespace);
    const transport = (0, import_muxen.createDuplexTransport)(link);
    this.transports.set(namespace, transport);
    transport.onClose(() => {
      this.transports.delete(namespace);
    });
    return transport;
  }
  /**
   * Opens the DevTools for this window's web contents.
   * @throws An `Error` if the window has been destroyed.
   */
  openDevTools() {
    if (this.isDestroyed) throw new Error("Cannot open DevTools: The window has been destroyed.");
    this.window.webContents.openDevTools();
  }
  /**
   * Loads a URL (including `http://`, `file://`, or `plugin://`) into the window.
   * This is a proxy to `BrowserWindow.loadURL`.
   * @param url The URL to load.
   * @throws An `Error` if the window has been destroyed.
   */
  async loadURL(url) {
    if (this.isDestroyed) throw new Error("Cannot load URL: The window has been destroyed.");
    return this.window.loadURL(url);
  }
  /**
   * Gets the current title of the window.
   * @returns The window title.
   * @throws An `Error` if the window has been destroyed.
   */
  getTitle() {
    if (this.isDestroyed) throw new Error("Cannot get title: The window has been destroyed.");
    return this.window.getTitle();
  }
  /**
   * Brings the window to the front and gives it focus.
   * @throws An `Error` if the window has been destroyed.
   */
  focus() {
    if (this.isDestroyed) throw new Error("Cannot focus window: The window has been destroyed.");
    this.window.focus();
  }
  /**
   * Shows the window if it is currently hidden.
   * @throws An `Error` if the window has been destroyed.
   */
  show() {
    if (this.isDestroyed) throw new Error("Cannot show window: The window has been destroyed.");
    this.window.show();
  }
  /**
   * Closes the window. This is an idempotent operation.
   */
  closeWindow() {
    if (this.isDestroyed) return;
    this.window.close();
  }
};

// src/core/ecore.ts
var import_node_stream = require("stream");
var import_tmp = require("tmp");
var import_node_fs = require("fs");
var import_promises = require("stream/promises");
var ECore = class {
  /**
   * Creates an instance of ECore.
   * @param system A reference to the main `esys` System instance, which is used
   *               to handle `plugin://` protocol requests for resource loading.
   */
  constructor(system) {
    this.system = system;
    this.installProtocolHandler();
  }
  isProtocolRegistered = false;
  /**
   * Registers the custom `plugin://` protocol handler.
   * This method ensures that requests for `plugin://` URIs are intercepted and
   * resolved by fetching the corresponding resource from the `esys` system.
   * It is idempotent and safely handles being called before or after the
   * `app` 'ready' event.
   */
  installProtocolHandler() {
    if (this.isProtocolRegistered) {
      return;
    }
    import_electron3.app.whenReady().then(() => {
      import_electron3.protocol.handle("plugin", async (request) => {
        const uri = request.url;
        try {
          const { body, mimeType } = await this.system.resources.get(uri);
          const headers = new Headers();
          if (mimeType) {
            headers.append("Content-Type", mimeType);
          }
          return new Response(body, {
            status: 200,
            statusText: "OK",
            headers
          });
        } catch (error) {
          console.error(
            `[ECore] Failed to handle plugin:// protocol for "${uri}":`,
            error.message
          );
          return new Response(null, {
            status: 404,
            statusText: "Not Found"
          });
        }
      });
      this.isProtocolRegistered = true;
    });
  }
  /**
   * Securely streams a preload script from a plugin resource URI to a temporary
   * file on the local filesystem. This is a critical security step, as Electron's
   * `preload` option requires an absolute file path, and we must not expose
   * the application's internal file structure to plugins.
   * @param preloadUri The `plugin://` URI of the preload script to load.
   * @returns A promise that resolves to the absolute path of the temporary file.
   * @throws An error if the resource cannot be fetched or written to a temporary file.
   */
  async streamPreloadToTempFile(preloadUri) {
    try {
      const { body } = await this.system.resources.get(preloadUri);
      const nodeReadable = import_node_stream.Readable.fromWeb(body);
      const tempFile = (0, import_tmp.fileSync)({
        prefix: "elep-preload-",
        postfix: ".js"
      });
      const writeStream = (0, import_node_fs.createWriteStream)(tempFile.name);
      await (0, import_promises.pipeline)(nodeReadable, writeStream);
      return tempFile.name;
    } catch (error) {
      throw new Error(
        `Failed to load preload script from "${preloadUri}": ${error.message}`
      );
    }
  }
  // --- Pin-able Public API ---
  /**
   * Creates a new application window (`BrowserWindow`) managed by an `EWindow` wrapper.
   * This method provides a simplified and secure interface for plugins to create UI.
   *
   * @param options Configuration options for the window, defined by `EWindowOptions`.
   * @returns A Promise that resolves to a `Pin<EWindow>`, a remotely-accessible proxy
   *          to the newly created window.
   */
  async createWindow(options = {}) {
    await import_electron3.app.whenReady();
    let preloadPath = void 0;
    const preloadUri = options.webPreferences?.preload;
    if (preloadUri) {
      preloadPath = await this.streamPreloadToTempFile(preloadUri);
    }
    const browserWindow = new import_electron3.BrowserWindow({
      // Spread user-provided top-level options (e.g., width, height, frame).
      ...options,
      webPreferences: {
        // Spread user-provided, non-critical webPreferences.
        ...options.webPreferences,
        // Enforce security-critical settings, overriding any user-provided values.
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    const eWindow = new EWindow(browserWindow);
    return (0, import_erpc.pin)(eWindow);
  }
  /**
   * Retrieves application-level process metrics, such as CPU and memory usage.
   * This is a direct proxy to Electron's `app.getAppMetrics()`.
   * @returns An array of process metric objects.
   */
  getAppMetrics() {
    return import_electron3.app.getAppMetrics();
  }
  /**
   * Gets the application's version string, as defined in `package.json`.
   * This is a direct proxy to Electron's `app.getVersion()`.
   * @returns The application version string.
   */
  getVersion() {
    return import_electron3.app.getVersion();
  }
  /**
   * Shuts down the `esys` system gracefully and then quits the Electron application.
   */
  async quit() {
    await this.system.shutdown();
    import_electron3.app.quit();
  }
};

// src/container/file-container.ts
var import_ebus = require("@eleplug/ebus");
var fs = __toESM(require("fs"));
var fsp = __toESM(require("fs/promises"));
var path = __toESM(require("path"));
var mime = __toESM(require("mime-types"));
var import_node_stream2 = require("stream");
var import_node_url = require("url");
var import_lru_cache = require("lru-cache");
var FileContainer = class {
  rootPath;
  bus;
  activeNodes = /* @__PURE__ */ new Map();
  mimeCache = new import_lru_cache.LRUCache({
    max: 500,
    ttl: 1e3 * 60 * 5
  });
  /**
   * @param bus A reference to the system's EBUS instance.
   * @param rootPath The absolute path to the directory where plugins are stored.
   */
  constructor(bus, rootPath) {
    this.rootPath = path.resolve(rootPath);
    this.bus = bus;
    if (!fs.existsSync(this.rootPath)) {
      fs.mkdirSync(this.rootPath, { recursive: true });
    }
  }
  // --- `esys` Container Interface Implementation ---
  plugins = {
    /**
     * Activates a plugin from the file system.
     * @param pluginPath The relative path of the plugin directory.
     */
    activate: async (containerName, pluginPath) => {
      const manifest = await this.plugins.manifest(pluginPath);
      if (this.activeNodes.has(pluginPath)) {
        return;
      }
      const mainScriptPath = this.secureJoin(
        this.rootPath,
        pluginPath,
        manifest.main
      );
      const mainScriptUrl = (0, import_node_url.pathToFileURL)(mainScriptPath).href;
      const pluginModule = await import(mainScriptUrl);
      const plugin = pluginModule.default;
      if (typeof plugin?.activate !== "function") {
        throw new Error(
          `Plugin at '${pluginPath}' does not have a valid default export with an 'activate' function.`
        );
      }
      const node = await this.bus.join({ id: manifest.name });
      const apiFactory = async (t) => {
        const context = {
          router: t.router,
          procedure: t.procedure,
          pluginUri: `plugin://${containerName}/${pluginPath}`,
          subscribe: node.subscribe.bind(node),
          emiter: node.emiter.bind(node),
          link: (pluginName) => {
            return node.connectTo(pluginName);
          }
        };
        return plugin.activate(context);
      };
      await node.setApi(apiFactory);
      this.activeNodes.set(pluginPath, node);
    },
    /**
     * Deactivates a running plugin.
     * @param pluginPath The relative path of the plugin directory.
     */
    deactivate: async (pluginPath) => {
      const node = this.activeNodes.get(pluginPath);
      if (node) {
        try {
          const manifest = await this.plugins.manifest(pluginPath);
          const mainScriptPath = this.secureJoin(
            this.rootPath,
            pluginPath,
            manifest.main
          );
          const mainScriptUrl = (0, import_node_url.pathToFileURL)(mainScriptPath).href;
          const pluginModule = await import(`${mainScriptUrl}?v=${Date.now()}`);
          const plugin = pluginModule.default;
          await plugin.deactivate?.();
        } catch (err2) {
          console.error(
            `[FileContainer] Error during plugin-specific deactivation for '${pluginPath}':`,
            err2.message
          );
        } finally {
          await node.close();
          this.activeNodes.delete(pluginPath);
        }
      }
    },
    /**
     * Reads and parses the package.json to construct a PluginManifest.
     * @param pluginPath The relative path of the plugin directory.
     * @returns A promise that resolves to the plugin's manifest.
     */
    manifest: async (pluginPath) => {
      const packageJsonPath = this.secureJoin(
        this.rootPath,
        pluginPath,
        "package.json"
      );
      try {
        const content = await fsp.readFile(packageJsonPath, "utf-8");
        const pkg = JSON.parse(content);
        if (!pkg.name || !pkg.version || !pkg.main) {
          throw new Error(
            `'name', 'version', and 'main' fields are required in package.json.`
          );
        }
        return {
          name: pkg.name,
          version: pkg.version,
          main: pkg.main,
          pluginDependencies: pkg.pluginDependencies || {}
        };
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new Error(
            `Plugin not found at path '${pluginPath}'. The package.json file is missing.`
          );
        }
        throw new Error(
          `Failed to read or parse package.json for plugin at '${pluginPath}': ${error.message}`
        );
      }
    }
  };
  resources = {
    get: async (resourcePath) => {
      const absolutePath = this.secureJoin(this.rootPath, resourcePath);
      try {
        const stats = await fsp.stat(absolutePath);
        if (stats.isDirectory()) {
          throw new Error("Path is a directory, not a file.");
        }
        const mimeType = await this.getMimeType(absolutePath);
        const nodeStream = fs.createReadStream(absolutePath);
        const body = import_node_stream2.Readable.toWeb(nodeStream);
        return { body, mimeType };
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new Error(`Resource not found: ${resourcePath}`);
        }
        throw new Error(
          `Failed to get resource '${resourcePath}': ${error.message}`
        );
      }
    },
    put: async (resourcePath, stream) => {
      const absolutePath = this.secureJoin(this.rootPath, resourcePath);
      try {
        await fsp.mkdir(path.dirname(absolutePath), { recursive: true });
        const nodeWritable = fs.createWriteStream(absolutePath);
        const webWritableStream = import_node_stream2.Writable.toWeb(nodeWritable);
        await stream.pipeTo(webWritableStream);
      } catch (error) {
        throw new Error(
          `Failed to write resource to '${resourcePath}': ${error.message}`
        );
      }
    },
    list: async (dirPath) => {
      const absolutePath = this.secureJoin(this.rootPath, dirPath);
      try {
        const stats = await fsp.stat(absolutePath);
        if (!stats.isDirectory()) {
          throw new Error("Path is not a directory.");
        }
        return fsp.readdir(absolutePath);
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new Error(`Directory not found: ${dirPath}`);
        }
        throw new Error(
          `Failed to list directory '${dirPath}': ${error.message}`
        );
      }
    }
  };
  async close() {
    const deactivationPromises = Array.from(this.activeNodes.keys()).map(
      (pluginPath) => this.plugins.deactivate(pluginPath)
    );
    await Promise.allSettled(deactivationPromises);
  }
  secureJoin(...segments) {
    const resolvedPath = path.resolve(...segments);
    const relative2 = path.relative(this.rootPath, resolvedPath);
    if (relative2.startsWith("..") || path.isAbsolute(relative2)) {
      throw new Error(
        `Path traversal detected. Attempted to access a path outside of the container root: ${resolvedPath}`
      );
    }
    return resolvedPath;
  }
  async getMimeType(absolutePath) {
    const dir = path.dirname(absolutePath);
    const filename = path.basename(absolutePath);
    let mimeMap = this.mimeCache.get(dir);
    if (!mimeMap) {
      const mimeJsonPath = path.join(dir, "mime.json");
      try {
        const content = await fsp.readFile(mimeJsonPath, "utf-8");
        mimeMap = JSON.parse(content);
        this.mimeCache.set(dir, mimeMap);
      } catch (err2) {
        if (err2.code === "ENOENT") {
          mimeMap = {};
          this.mimeCache.set(dir, mimeMap);
        } else {
          console.warn(
            `[FileContainer] Could not read or parse mime.json in ${dir}:`,
            err2.message
          );
          mimeMap = {};
        }
      }
    }
    if (mimeMap?.[filename]) {
      return mimeMap[filename];
    }
    const fallbackMime = mime.lookup(filename);
    return fallbackMime || void 0;
  }
};

// src/transport/ipc-renderer-link.ts
var import_mimic2 = __toESM(require("@eleplug/mimic"));
var import_transport3 = require("@eleplug/transport");
var IpcRendererLink = class {
  /**
   * @param ipc The `IpcShape` adapter, created by `createAdapter` from the
   *            preload script, which provides namespaced communication methods.
   */
  constructor(ipc) {
    this.ipc = ipc;
    this.messageListener = (_event, message) => {
      this.events.emit("message", import_mimic2.default.parse(message));
    };
    this.ipc.on(this.messageListener);
  }
  events = new import_transport3.AsyncEventEmitter();
  isClosed = false;
  // A reference to the listener function for proper removal.
  messageListener;
  onMessage(handler) {
    this.events.on("message", handler);
  }
  sendMessage(packet) {
    if (this.isClosed) {
      return Promise.reject(new Error(`Link is closed.`));
    }
    this.ipc.send(import_mimic2.default.stringify(packet));
    return Promise.resolve();
  }
  onClose(handler) {
    this.events.on("close", handler);
  }
  close() {
    return this.internalClose();
  }
  abort(reason) {
    return this.internalClose(reason);
  }
  internalClose(reason) {
    if (this.isClosed) {
      return Promise.resolve();
    }
    this.isClosed = true;
    this.ipc.off(this.messageListener);
    this.events.emit("close", reason);
    this.events.removeAllListeners();
    return Promise.resolve();
  }
};

// src/index.ts
var import_anvil = require("@eleplug/anvil");
var import_esys = require("@eleplug/esys");
var import_ebus2 = require("@eleplug/ebus");
var import_erpc2 = require("@eleplug/erpc");
var import_plexus = require("@eleplug/plexus");
var import_muxen2 = require("@eleplug/muxen");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Bootloader,
  DependencyGraph,
  DependencyResolver,
  DiffResult,
  ECore,
  EWindow,
  FileContainer,
  IpcLink,
  IpcRendererLink,
  MemoryContainer,
  Registry,
  Requirements,
  System,
  buildClient,
  createDuplexTransport,
  definePlugin,
  err,
  free,
  initEBUS,
  initERPC,
  middleware,
  ok,
  pin
});
