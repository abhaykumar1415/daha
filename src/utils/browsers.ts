import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'fs-extra';
import { chromium } from 'playwright';
import { execa } from 'execa';
import chalk from 'chalk';
import ora from 'ora';
import { DahaError } from './errors.js';

/**
 * Returns the expected Playwright Chromium executable path for this platform.
 */
export function getChromiumExecutablePath(): string {
  return chromium.executablePath();
}

/**
 * Whether the Playwright Chromium binary path exists on disk.
 */
export function isChromiumInstalled(): boolean {
  try {
    return fs.existsSync(getChromiumExecutablePath());
  } catch {
    return false;
  }
}

/**
 * Confirms Chromium can actually launch (covers headless-shell and path quirks).
 */
export async function isChromiumUsable(): Promise<boolean> {
  if (isChromiumInstalled()) {
    return true;
  }

  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the Playwright CLI entry shipped with the `playwright` dependency.
 */
export function resolvePlaywrightCli(): string {
  const require = createRequire(import.meta.url);
  try {
    const pkgJson = require.resolve('playwright/package.json');
    return path.join(path.dirname(pkgJson), 'cli.js');
  } catch {
    const pkgJson = require.resolve('playwright/package.json', { paths: [process.cwd()] });
    return path.join(path.dirname(pkgJson), 'cli.js');
  }
}

export interface InstallChromiumOptions {
  /** Re-download even if already installed. */
  force?: boolean;
  /** Suppress ora spinner (still streams Playwright install output). */
  silent?: boolean;
}

/**
 * Downloads Playwright Chromium via the local playwright CLI.
 */
export async function installChromium(options: InstallChromiumOptions = {}): Promise<void> {
  const { force = false, silent = false } = options;
  const cli = resolvePlaywrightCli();
  const args = ['install', 'chromium'];
  if (force) {
    args.push('--force');
  }

  const spinner = silent ? null : ora('Installing Playwright Chromium (one-time download)...').start();

  try {
    // Stop spinner before inherit so Playwright's own progress bars render cleanly.
    spinner?.stop();
    await execa(process.execPath, [cli, ...args], {
      stdio: 'inherit',
    });
    if (!silent) {
      console.log(chalk.green('✓ Playwright Chromium installed successfully.'));
    }
  } catch (error: any) {
    spinner?.fail('Failed to install Playwright Chromium.');
    throw new DahaError(
      `Failed to install Playwright Chromium: ${error.message}\n` +
        'Try running: `daha setup` or `npx playwright install chromium`',
      'BROWSER_ERROR'
    );
  }
}

export interface EnsureChromiumOptions {
  /** When true (default), download Chromium if missing. */
  autoInstall?: boolean;
}

/**
 * Ensures Chromium is available before Lighthouse audits.
 * Auto-installs on first run unless `autoInstall` is false.
 */
export async function ensureChromiumReady(options: EnsureChromiumOptions = {}): Promise<void> {
  const autoInstall = options.autoInstall !== false;

  if (await isChromiumUsable()) {
    return;
  }

  console.log(chalk.yellow('\nPlaywright Chromium is not installed.'));

  if (!autoInstall) {
    throw new DahaError(
      'Playwright Chromium is required for audits.\n' +
        'Run `daha setup` (or `npx playwright install chromium`) and retry.',
      'BROWSER_ERROR'
    );
  }

  console.log(chalk.blue('Installing Chromium automatically (first-run setup)...\n'));
  await installChromium({ silent: false });

  if (!(await isChromiumUsable())) {
    throw new DahaError(
      'Chromium install finished but the browser could not be launched.\n' +
        'Run `daha setup --force` and retry.',
      'BROWSER_ERROR'
    );
  }
}
