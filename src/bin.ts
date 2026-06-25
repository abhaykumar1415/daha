import { Command } from 'commander';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { handleInitCommand } from './cli/init.js';
import { handleRoutesCommand } from './cli/routes.js';
import { handleCheckCommand } from './cli/check.js';
import { handleServeCommand } from './cli/serve.js';
import { handleDoctorCommand } from './cli/doctor.js';
import { handleWatchCommand } from './cli/watch.js';
import { handleInitHooksCommand } from './cli/hooks.js';
import { handleWorkspaceCommand } from './cli/workspace.js';
import { runAudit } from './core/orchestrator.js';
import { loadConfig } from './config/loader.js';

// Resolve directory name in ESM environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package version
const getVersion = (): string => {
  try {
    const possiblePaths = [
      path.join(__dirname, 'package.json'),
      path.join(__dirname, '..', 'package.json'),
      path.join(__dirname, '..', '..', 'package.json'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        const pkg = fs.readJsonSync(p);
        return pkg.version;
      }
    }
  } catch {
    // Fallback
  }
  return '1.0.0';
};

const program = new Command();

program
  .name('daha')
  .description('Performance as Code for Next.js - Core Web Vitals and Lighthouse Audits CLI')
  .version(getVersion());

// 1. init command
program
  .command('init')
  .description('Initialize a default daha.config.ts file in the current directory')
  .action(async () => {
    await handleInitCommand();
  });

// 2. routes command
program
  .command('routes')
  .description('Discover and list all routes in the current Next.js project')
  .option('-c, --config <file>', 'Path to custom configuration file')
  .option('--json', 'Output discovered routes as JSON array')
  .action(async (options) => {
    await handleRoutesCommand(options);
  });

// 3. check command
program
  .command('check')
  .description('Quickly assert threshold violations against a pre-existing summary JSON report')
  .option('-c, --config <file>', 'Path to custom configuration file')
  .option('-s, --summary <file>', 'Path to the summary.json file to validate')
  .action(async (options) => {
    await handleCheckCommand(options);
  });

// 3a. serve command
program
  .command('serve')
  .description('Serve the local historical audits dashboard')
  .option('-c, --config <file>', 'Path to custom configuration file')
  .option('-p, --port <number>', 'Override server port (default 4000)')
  .option('--host <string>', 'Override server host (default localhost)')
  .option('--ci', 'Run in continuous integration mode (do not auto-open browser)')
  .action(async (options) => {
    await handleServeCommand(options);
  });

// 3b. doctor command
program
  .command('doctor')
  .description('Run static performance analysis on target source files')
  .option('-c, --config <file>', 'Path to custom configuration file')
  .action(async (options) => {
    await handleDoctorCommand(options);
  });

// 3c. watch command
program
  .command('watch')
  .description('Watch project source files and automatically run dev audits on change')
  .option('-c, --config <file>', 'Path to custom configuration file')
  .option('-p, --port <number>', 'Override server dev port (default 3000)')
  .action(async (options) => {
    await handleWatchCommand(options);
  });

// 3d. init-hooks command
program
  .command('init-hooks')
  .description('Configure a git pre-commit hook running performance checks')
  .action(async () => {
    await handleInitHooksCommand();
  });

// 3e. workspace command
program
  .command('workspace')
  .description('Run Daha audits concurrently across all monorepo workspace packages')
  .option('--concurrency <number>', 'Override number of packages audited in parallel (default: 2)')
  .option('--runs <number>', 'Override number of runs per route')
  .option('--ci', 'Continuous Integration mode (minimal output, no dynamic progress spinners)')
  .option('--verbose', 'Print verbose debug logs')
  .action(async (options) => {
    await handleWorkspaceCommand(options);
  });

// 4. audit command (default or explicit)
program
  .command('audit', { isDefault: true })
  .description('Run production build, launch local server, and perform Lighthouse audits')
  .option('-c, --config <file>', 'Path to custom configuration file')
  .option('-r, --route <path>', 'Audit only this specific route path')
  .option('--dev', 'Run in development mode (expects running server at port 3000, skips build)')
  .option('--ci', 'Continuous Integration mode (minimal output, no dynamic progress spinners)')
  .option('--baseline', 'Save this run as the new baseline performance metrics')
  .option('--mobile', 'Force mobile audit preset')
  .option('--desktop', 'Force desktop audit preset')
  .option('--setup <file>', 'Path to custom Playwright setup script')
  .option('--framework <name>', 'Force specific framework router (next, remix, astro, sveltekit, auto)')
  .option('--max-js <kb>', 'Force total JS size budget limit (in KB)')
  .option('--max-css <kb>', 'Force total CSS size budget limit (in KB)')
  .option('--max-images <kb>', 'Force total images size budget limit (in KB)')
  .option('--concurrency <number>', 'Override concurrency limit')
  .option('--runs <number>', 'Override number of runs per route')
  .option('--timeout <ms>', 'Override timeout limit per route')
  .option('--url <address>', 'Audit a live deployed deployment URL (skips local server compile and start)')
  .option('-o, --open', 'Open HTML dashboard after audit completes')
  .option('--verbose', 'Print verbose debug logs')
  .option('--docker', 'Run audit inside a Docker container for consistent hardware baseline')
  .action(async (options) => {
    try {
      // Handle docker runner spawning
      const inDocker = fs.existsSync('/.dockerenv');
      if (options.docker && !inDocker) {
        console.log(chalk.blue('🐳 Spawning audit inside Docker container for consistent hardware baseline...'));
        const argsToForward = process.argv.slice(2).filter(arg => arg !== '--docker');
        if (argsToForward[0] !== 'audit') {
          argsToForward.unshift('audit');
        }
        const currentDir = process.cwd();
        const dockerArgs = [
          'run',
          '--rm',
          '-v', `${currentDir}:/project`,
          '-w', '/project',
          '--net=host',
          'daha',
          ...argsToForward
        ];
        const { spawnSync } = await import('node:child_process');
        const result = spawnSync('docker', dockerArgs, { stdio: 'inherit' });
        process.exit(result.status ?? 0);
      }

      // Load configuration
      const config = await loadConfig(options.config);

      // Apply CLI overrides to configuration options
      if (options.url) {
        config.server = config.server || {};
        config.server.url = options.url;
      }
      if (options.setup) {
        config.options.setupScript = options.setup;
      }
      if (options.framework) {
        config.options.framework = options.framework as any;
      }
      if (options.concurrency) {
        config.options.concurrency = parseInt(options.concurrency, 10);
      }
      if (options.runs) {
        config.options.numberOfRuns = parseInt(options.runs, 10);
      }
      if (options.timeout) {
        config.options.timeoutMs = parseInt(options.timeout, 10);
      }
      if (options.open) {
        config.output.openReport = true;
      }

      // Apply CLI overrides to resource budgets
      if (options.maxJs || options.maxCss || options.maxImages) {
        config.thresholds.budgets = config.thresholds.budgets || {};
        if (options.maxJs) {
          config.thresholds.budgets.maxTotalJsSizeKb = parseFloat(options.maxJs);
        }
        if (options.maxCss) {
          config.thresholds.budgets.maxTotalCssSizeKb = parseFloat(options.maxCss);
        }
        if (options.maxImages) {
          config.thresholds.budgets.maxTotalImageSizeKb = parseFloat(options.maxImages);
        }
      }

      // Trigger orchestrator
      const summary = await runAudit({
        config,
        devMode: !!options.dev,
        ciMode: !!options.ci,
        baselineMode: !!options.baseline,
        presetOverride: options.mobile ? 'mobile' : options.desktop ? 'desktop' : undefined,
        routeOverride: options.route,
        verbose: !!options.verbose,
      });

      // Exit with failure code if audit thresholds not met
      if (!summary.passed) {
        process.exit(1);
      }
      process.exit(0);
    } catch (error: any) {
      console.error(chalk.red(`\n❌ Audit Failed: ${error.message}`));
      if (options.verbose && error.stack) {
        console.error(chalk.dim(error.stack));
      }
      console.log('');
      process.exit(1);
    }
  });

// Handle uncaught errors cleanly
process.on('unhandledRejection', (reason: any) => {
  console.error(chalk.red('\nUnhandled Promise Rejection:'));
  console.error(reason);
  process.exit(1);
});

program.parse(process.argv);
