import type { KernelApi } from "./router";

/**
 * Extends the global PluginApiMap via declaration merging.
 * This provides full type-safety for `context.link('__kernel')` calls.
 */
declare module "@eleplug/anvil" {
  interface PluginApiMap {
    __kernel: KernelApi;
  }
}
