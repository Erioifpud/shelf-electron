/**
 * @fileoverview
 * This file contains the DevServer class, which orchestrates the entire `elep dev` command workflow.
 * It coordinates plugin discovery, boot configuration generation, and process management
 * to create a seamless development experience.
 */

import { ProjectConfig } from './project-config.js';
import { PluginDiscovery } from './plugin-discovery.js';
import { BootConfigGenerator } from './boot-config-generator.js';
import { ProcessManager } from './process-manager.js';
import type { DiscoveredPlugin } from './types.js';
import chalk from 'chalk';

/**
 * The main controller for the `elep dev` command.
 * Manages the sequence of operations required to launch the development environment.
 */
export class DevServer {
  private readonly projectConfig: ProjectConfig;
  private readonly pluginDiscovery: PluginDiscovery;
  private readonly bootConfigGenerator: BootConfigGenerator;
  private processManager: ProcessManager | null = null;

  /**
   * Creates an instance of DevServer.
   * @param rootPath The absolute path to the project's root directory (typically `process.cwd()`).
   */
  constructor(rootPath: string) {
    this.projectConfig = new ProjectConfig(rootPath);
    this.pluginDiscovery = new PluginDiscovery(rootPath);
    this.bootConfigGenerator = new BootConfigGenerator();
  }

  /**
   * Starts the development server and the elep-boot application.
   * This method executes the full startup workflow, providing clear feedback to the user at each stage.
   */
  public async start(): Promise<void> {
    try {
      console.log(chalk.blue("------------------------------------------"));
      console.log(chalk.cyan("🚀 Starting Elep Development Server..."));
      console.log(chalk.blue("------------------------------------------"));

      // --- Step 1: Discover Dependency Plugins ---
      console.log(chalk.yellow("Step 1: Discovering dependency plugins..."));
      const dependencyPlugins = await this.pluginDiscovery.discoverPlugins();
      if (dependencyPlugins.length > 0) {
        console.log(chalk.green(`  ✅ Found ${dependencyPlugins.length} dependency plugins in 'elep_plugins/'.`));
      } else {
        console.log(chalk.gray("  - No dependency plugins found."));
      }
      
      // --- Step 2: Identify the Current Plugin ---
      console.log(chalk.yellow("Step 2: Identifying current plugin..."));
      const currentPluginManifest = await this.projectConfig.getManifest();
      const currentPlugin: DiscoveredPlugin = {
          name: currentPluginManifest.name,
          version: currentPluginManifest.version,
          // For the current plugin, its path within its own container is the root.
          pathInStaging: '', 
          manifest: currentPluginManifest
      };
      console.log(chalk.green(`  ✅ Current plugin: ${chalk.bold(`${currentPlugin.name}@${currentPlugin.version}`)}`));
      
      console.log(`📋 Total plugins to launch: ${1 + dependencyPlugins.length}.`);

      // --- Step 3: Generate Boot Configuration ---
      console.log(chalk.yellow("Step 3: Generating boot configuration..."));
      const bootConfig = this.bootConfigGenerator.generate(
        currentPlugin,
        dependencyPlugins,
        './elep_plugins' // Relative path for the dependencies container.
      );
      console.log(chalk.green("  ✅ In-memory boot configuration generated."));

      // --- Step 4: Launch the Elep Application ---
      console.log(chalk.yellow("Step 4: Launching Elep application..."));
      this.processManager = new ProcessManager(this.projectConfig, bootConfig);
      
      // Set up signal handlers for graceful shutdown.
      process.on('SIGINT', () => this.stop('SIGINT'));
      process.on('SIGTERM', () => this.stop('SIGTERM'));

      this.processManager.start();

    } catch (error: any) {
      console.error(chalk.red(`❌ A fatal error occurred during startup: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Stops the development server and the elep-boot child process.
   * @param signal The signal that triggered the stop command (e.g., 'SIGINT').
   */
  public async stop(signal: string): Promise<void> {
    console.log(chalk.yellow(`\n🚨 Received ${signal}. Shutting down...`));
    if (this.processManager) {
      this.processManager.stop();
    }
  }
}