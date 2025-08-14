// src/index.ts
function resolvePluginUri(baseUri, relativePath) {
  const base = new URL(baseUri.endsWith("/") ? baseUri : `${baseUri}/`);
  const resolved = new URL(relativePath, base);
  return resolved.href;
}
function definePlugin(plugin) {
  return plugin;
}
export {
  definePlugin,
  resolvePluginUri
};
