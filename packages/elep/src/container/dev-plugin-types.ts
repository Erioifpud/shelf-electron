import type { ResourceGetResponse } from "@eleplug/esys";

/**
 * The context object provided to a DevPlugin's `start` method.
 * It contains essential information about the plugin being managed.
 */
export interface DevPluginContext {
  /**
   * The root URI of the plugin being managed.
   * e.g., "plugin://my-container/my-plugin"
   */
  readonly pluginUri: string;
  /**
   * The absolute path to the plugin's root directory on the filesystem.
   * This is useful for development tools that need to operate on the source files.
   */
  readonly pluginAbsolutePath: string;
}

/**
 * Defines the interface for a development mode adapter.
 * An object implementing this interface can be provided in the `dev`
 * property of `elep.config.ts` to integrate development tools like
 * Vite or Webpack Dev Server.
 */
export interface DevPlugin {
  /**
   * A lifecycle hook called when the plugin is activated in development mode.
   * This is the designated place to start development servers, initialize file watchers,
   * or perform other setup tasks.
   * @param context Provides contextual information about the plugin.
   */
  start(context: DevPluginContext): Promise<void> | void;

  /**
   * A lifecycle hook called when the plugin is deactivated or the system shuts down.
   * This should be used to gracefully shut down any services or processes
   * that were started in the `start` method.
   */
  stop(): Promise<void> | void;

  /**
   * (Optional) An interceptor for resource 'get' requests for this plugin.
   *
   * If this hook is implemented, it will be called before the default file storage
   * handler. It can be used to serve assets from a development server, enabling
   * features like Hot Module Replacement (HMR).
   *
   * @param resourcePathInPlugin The sub-path of the resource within the plugin (e.g., "src/index.html").
   * @returns A promise that resolves to a `ResourceGetResponse`.
   *          If the hook cannot or should not handle the request, it must throw an error
   *          or return a rejecting promise. This will cause the system to fall back
   *          to the default file system storage.
   */
  get?(resourcePathInPlugin: string): Promise<ResourceGetResponse>;

  /**
   * (Optional) An interceptor for resource 'put' requests for this plugin.
   *
   * @param resourcePathInPlugin The sub-path of the resource to write to.
   * @param stream A `ReadableStream` containing the new content.
   * @returns A promise that resolves when the operation is complete.
   *          Throw an error to fall back to the default storage.
   */
  put?(resourcePathInPlugin: string, stream: ReadableStream): Promise<void>;

  /**
   * (Optional) An interceptor for resource 'list' requests for this plugin.
   *
   * @param resourcePathInPlugin The sub-path of the directory to list.
   * @returns A promise that resolves to an array of file and directory names.
   *          Throw an error to fall back to the default storage.
   */
  list?(resourcePathInPlugin: string): Promise<string[]>;
}
