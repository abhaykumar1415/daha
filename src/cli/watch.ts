import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/loader.js';
import { runAudit } from '../core/orchestrator.js';
import { 
  detectFramework, 
  normalizeAppRouterPath, 
  normalizePagesRouterPath,
  normalizeSvelteKitPath,
  normalizeAstroPath,
  normalizeRemixPath
} from '../discovery/index.js';

export interface WatchOptions {
  config?: string;
  port?: string;
}

export async function handleWatchCommand(options: WatchOptions): Promise<void> {
  const config = await loadConfig(options.config);
  const projectDir = process.cwd();
  
  const devPort = options.port || config.server?.port || 3000;
  const devUrl = config.server?.url || `http://localhost:${devPort}`;

  console.log(chalk.bold.cyan('\n👀 Daha Watcher Active'));
  console.log(chalk.white(`Listening for filesystem modifications...`));
  console.log(chalk.white(`Expecting development server at: ${chalk.bold.underline(devUrl)}`));
  console.log(chalk.dim('Make sure your framework development server is running (e.g. `npm run dev` or `next dev`).\n'));

  // Detect framework
  const framework = config.options?.framework === 'auto' || !config.options?.framework
    ? await detectFramework(projectDir)
    : config.options.framework;

  const foldersToWatch = ['app', 'pages', 'src', 'components', 'routes'];
  const activeWatchDirs: string[] = [];

  for (const f of foldersToWatch) {
    const fullPath = path.join(projectDir, f);
    if (await fs.pathExists(fullPath)) {
      activeWatchDirs.push(f);
    }
  }

  if (activeWatchDirs.length === 0) {
    console.error(chalk.red('Error: No source directories found to watch (app, pages, src, components, routes).'));
    process.exit(1);
  }

  // Debouncing setup to prevent double-execution
  let debounceTimeout: NodeJS.Timeout | null = null;
  const changedFiles = new Set<string>();

  const triggerAudit = async () => {
    const files = Array.from(changedFiles);
    changedFiles.clear();

    console.log(chalk.bold.cyan(`\n⚡ File change detected in: ${files.join(', ')}`));

    // Resolve specific route overrides
    let routeOverride: string | undefined = undefined;
    let componentOrLayoutModified = false;

    for (const file of files) {
      const normalizedPath = file.replace(/\\/g, '/');
      let route: string | null = null;

      if (framework === 'next') {
        if (normalizedPath.startsWith('app/') || normalizedPath.startsWith('src/app/')) {
          const relative = normalizedPath.startsWith('src/') ? normalizedPath.slice(4) : normalizedPath;
          route = normalizeAppRouterPath(relative);
        } else if (normalizedPath.startsWith('pages/') || normalizedPath.startsWith('src/pages/')) {
          const relative = normalizedPath.startsWith('src/') ? normalizedPath.slice(4) : normalizedPath;
          route = normalizePagesRouterPath(relative);
        }
      } else if (framework === 'sveltekit') {
        route = normalizeSvelteKitPath(normalizedPath);
      } else if (framework === 'astro') {
        route = normalizeAstroPath(normalizedPath);
      } else if (framework === 'remix') {
        route = normalizeRemixPath(normalizedPath);
      }

      if (route) {
        routeOverride = route;
      } else {
        // If it's a shared component, stylesheet, or context, we must re-audit everything
        componentOrLayoutModified = true;
      }
    }

    // Force single run, dev mode, concurrency 1 for speed
    const watchConfig = {
      ...config,
      options: {
        ...config.options,
        numberOfRuns: 1,
        concurrency: 1,
      },
      server: {
        ...config.server,
        url: devUrl,
      }
    };

    if (componentOrLayoutModified) {
      console.log(chalk.yellow('Shared layouts or components modified. Re-auditing all discovered routes...'));
      routeOverride = undefined;
    } else if (routeOverride) {
      console.log(chalk.yellow(`Route-specific page modified. Auditing only: ${routeOverride}`));
    } else {
      console.log(chalk.yellow('Asset file modified. Re-auditing all routes...'));
    }

    const spinner = ora('Auditing modified routes...').start();
    try {
      await runAudit({
        config: watchConfig as any,
        devMode: true,
        ciMode: true, // Silent spinners in orchestrator, we print logs here
        routeOverride,
        verbose: false,
      });
      spinner.succeed('Audit update complete.');
    } catch (err: any) {
      spinner.fail(`Audit update failed: ${err.message}`);
    }
  };

  // Watch active directories
  for (const dir of activeWatchDirs) {
    const fullPath = path.join(projectDir, dir);
    fs.watch(fullPath, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;

      // Ignore standard build/cache directories just in case they reside inside watched directories
      if (filename.includes('.next') || filename.includes('.daha') || filename.includes('node_modules')) {
        return;
      }

      const relativeFile = path.join(dir, filename);
      changedFiles.add(relativeFile);

      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      debounceTimeout = setTimeout(() => {
        triggerAudit();
      }, 500);
    });
  }

  // Keep process alive
  await new Promise(() => {});
}
