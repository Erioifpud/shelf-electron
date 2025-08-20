import type { ResourceGetResponse } from "@eleplug/esys";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as mime from "mime-types";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Defines the abstract interface for a pure, low-level resource storage backend.
 * This contract focuses solely on I/O operations and expects absolute paths,
 * ensuring implementing classes can be simple and secure.
 */
export interface IResourceStorage {
  get(absolutePath: string): Promise<ResourceGetResponse>;
  put(absolutePath: string, stream: ReadableStream): Promise<void>;
  list(absolutePath: string): Promise<string[]>;
  getMimeType(absolutePath: string): string | undefined;
}

/**
 * A concrete implementation of `IResourceStorage` that uses the local file system.
 * It provides secure, sandboxed access to a specific root directory and has no
 * knowledge of plugins, runtimes, or development mode. Its sole responsibility
 * is to safely interact with the filesystem.
 */
export class FileStorage implements IResourceStorage {
  /**
   * @param rootPath The absolute path to the root directory this storage manages.
   *                 All operations are sandboxed to this directory.
   */
  constructor(private readonly rootPath: string) {
    if (!fs.existsSync(this.rootPath)) {
      fs.mkdirSync(this.rootPath, { recursive: true });
    }
  }

  /**
   * Securely resolves a given path against the container's root directory.
   * This is a critical security function to prevent path traversal attacks (e.g., `../`).
   * It ensures that any file access is strictly contained within the intended sandbox.
   * @param targetPath The path to resolve and validate.
   * @returns The resolved, secure absolute path.
   * @throws An `Error` if the resolved path attempts to escape the root directory.
   */
  private secureResolve(targetPath: string): string {
    // First, resolve the path normally. This canonicalizes it (e.g., resolves '..').
    const resolvedPath = path.resolve(this.rootPath, targetPath);

    // CRITICAL SECURITY CHECK: Ensure the resolved path is still a child of the root path.
    // We add the platform-specific separator to prevent partial matches (e.g., /root/dir matching /root/dir-something).
    if (
      !resolvedPath.startsWith(this.rootPath + path.sep) &&
      resolvedPath !== this.rootPath
    ) {
      throw new Error(
        `Path traversal detected. Access to ${resolvedPath} is denied.`
      );
    }
    return resolvedPath;
  }

  public async get(absolutePath: string): Promise<ResourceGetResponse> {
    const securePath = this.secureResolve(absolutePath);
    try {
      const stats = await fsp.stat(securePath);
      if (stats.isDirectory()) {
        throw new Error(`Path is a directory, not a file: "${absolutePath}"`);
      }
      const mimeType = this.getMimeType(securePath);
      const nodeReadable = fs.createReadStream(securePath);
      const body = Readable.toWeb(nodeReadable) as ReadableStream<Uint8Array>;
      return { body, mimeType };
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw new Error(`Resource not found: "${absolutePath}"`);
      }
      throw error;
    }
  }

  public async put(
    absolutePath: string,
    stream: ReadableStream
  ): Promise<void> {
    const securePath = this.secureResolve(absolutePath);
    try {
      await fsp.mkdir(path.dirname(securePath), { recursive: true });
      const nodeWritable = fs.createWriteStream(securePath);
      await pipeline(Readable.fromWeb(stream as any), nodeWritable);
    } catch (error: any) {
      throw new Error(`Failed to write to "${absolutePath}": ${error.message}`);
    }
  }

  public async list(absolutePath: string): Promise<string[]> {
    const securePath = this.secureResolve(absolutePath);
    try {
      const stats = await fsp.stat(securePath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: "${absolutePath}"`);
      }
      return await fsp.readdir(securePath);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        throw new Error(`Directory not found: "${absolutePath}"`);
      }
      throw error;
    }
  }

  public getMimeType(absolutePath: string): string | undefined {
    const securePath = this.secureResolve(absolutePath);
    return mime.lookup(securePath) || undefined;
  }
}
