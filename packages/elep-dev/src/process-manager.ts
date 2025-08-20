/**
 * @fileoverview
 * Manages the lifecycle of the `elep-boot` child process using the robust `execa` library.
 * This version uses a dynamic resolution mechanism to safely locate the boot script,
 * ensuring compatibility across different package manager setups (npm, pnpm, yarn).
 */

import { execa } from 'execa';
import type { ProjectConfig } from './project-config.js';
import type { AppConfig } from '@eleplug/elep-boot/config';

// Infer the child process type directly from the `execa` function's return type.
// This is the most robust way to get the type, as it doesn't rely on named exports
// which can change between library versions.
type ExecaProcess = ReturnType<typeof execa>;

/**
 * A robust manager for launching and terminating the `elep-boot` child process.
 */
export class ProcessManager {
  private readonly projectConfig: ProjectConfig;
  private readonly bootConfig: AppConfig;
  private bootProcess: ExecaProcess | null = null;

  /**
   * Creates an instance of ProcessManager.
   * @param projectConfig The configuration of the current project.
   * @param bootConfig The in-memory `AppConfig` to be passed to the `elep-boot` process.
   */
  constructor(projectConfig: ProjectConfig, bootConfig: AppConfig) {
    this.projectConfig = projectConfig;
    this.bootConfig = bootConfig;
  }

  /**
   * Starts the `elep-boot` child process by invoking its registered `boot` command via Electron.
   * It dynamically resolves the path to the boot script to ensure robustness.
   */
  public start(): void {
    if (this.bootProcess) {
      console.warn('[ProcessManager] Process is already running. Ignoring start request.');
      return;
    }

    const configString = JSON.stringify(this.bootConfig);
    // These arguments will be passed to the elep-boot application itself.
    const appArgs = [
      '--config', configString,
      '--cwd',
      '--dev',
    ];

    // CRITICAL FIX: Use `require.resolve` to dynamically and safely find the entry point
    // of the `@eleplug/elep-boot` package. This is far more robust than a hardcoded path.
    const bootScriptPath = require.resolve('@eleplug/elep-boot');

    console.log(`🚀 Starting elep-boot via Electron...`);
    console.log(`   - Script: ${bootScriptPath}`);
    
    // Launch Electron, passing the resolved boot script as the first argument,
    // followed by our application-specific arguments.
    this.bootProcess = execa('electron', [bootScriptPath, ...appArgs], {
      cwd: this.projectConfig.rootPath,
      stdio: 'inherit', // Pipe stdout/stderr directly to the parent process.
      preferLocal: true, // Crucial for finding the project's local 'electron' binary.
      cleanup: true, // Ensure the child process is killed on exit.
    });
    
    this.bootProcess
      .then(result => {
        console.log(`🔻 elep-boot process exited gracefully (code ${result.exitCode}).`);
        process.exit(result.exitCode);
      })
      .catch(error => {
        // execa provides a `isCanceled` flag to differentiate between manual stops and crashes.
        if (!error.isCanceled) {
          console.error(`❌ elep-boot process failed:`);
          console.error(error.shortMessage || error.message);
        }
        process.exit(error.exitCode ?? 1);
      });
  }
  
  /**
   * Stops the `elep-boot` child process gracefully by sending a SIGTERM signal.
   */
  public stop(): void {
    if (this.bootProcess) {
      console.log('🔌 Stopping elep-boot process...');
      // `kill()` is the execa method to send a signal. SIGTERM is a graceful request to terminate.
      this.bootProcess.kill('SIGTERM');
      this.bootProcess = null;
    }
  }
}