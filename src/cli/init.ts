import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';

const DEFAULT_CONFIG_TEMPLATE = `import { VitixConfig } from 'vitix';

const config: VitixConfig = {
  // Routes to audit. 'auto' discovers all App and Pages router paths automatically.
  routes: 'auto',

  // For dynamic routes (e.g. '/blog/[slug]'), define values to replace placeholders.
  dynamicRouteParams: {
    // '/blog/[slug]': ['hello-world', 'performance-audit-guide'],
  },

  // Target thresholds for passing audits. Tested against the median run.
  thresholds: {
    categories: {
      performance: 90,
      accessibility: 90,
      'best-practices': 90,
      seo: 90,
    },
    metrics: {
      // Core Web Vitals thresholds (LCP in ms, CLS score, TBT in ms)
      LCP: { max: 2500 },
      CLS: { max: 0.1 },
      TBT: { max: 300 },
    },
  },

  // Configuration options
  options: {
    numberOfRuns: 3,        // Number of audits per route to ensure stable median
    preset: 'mobile',       // 'mobile' | 'desktop' | 'both'
    concurrency: 1,         // Number of parallel routes audited
    timeoutMs: 60000,       // Max timeout per page audit
  },

  // Build commands and directories
  build: {
    command: 'npm run build',
    dir: '.next',
  },

  // Start production server commands
  server: {
    command: 'npm run start',
    port: 3000,
  },

  // Output directories and formats
  output: {
    dir: '.vitix',
    formats: ['html', 'json', 'junit'],
    openReport: false,
  },
};

export default config;
`;

/**
 * Initializes a default configuration file in the working directory.
 */
export async function handleInitCommand(): Promise<void> {
  const targetPath = path.join(process.cwd(), 'vitix.config.ts');

  if (await fs.pathExists(targetPath)) {
    console.log(chalk.yellow(`\n⚠️  Configuration file already exists at ${targetPath}`));
    console.log(chalk.gray('Abort initialization. Delete the existing file or rename it first.\n'));
    return;
  }

  try {
    await fs.writeFile(targetPath, DEFAULT_CONFIG_TEMPLATE, 'utf8');
    console.log(chalk.green(`\n✓ Successfully initialized Vitix configuration file!`));
    console.log(chalk.white(`Created config at: ${chalk.bold(targetPath)}\n`));
  } catch (error: any) {
    console.error(chalk.red(`Failed to create configuration file: ${error.message}`));
    process.exit(1);
  }
}
