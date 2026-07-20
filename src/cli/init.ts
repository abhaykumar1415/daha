import path from 'node:path';
import readline from 'node:readline';
import fs from 'fs-extra';
import chalk from 'chalk';

const DEFAULT_CONFIG_TEMPLATE = `import { DahaConfig } from 'daha-cli';

const config: DahaConfig = {
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
    dir: '.daha',
    formats: ['html', 'json', 'junit'],
    openReport: false,
  },
};

export default config;
`;

const GITIGNORE_ENTRY = '.daha/';
const TSCONFIG_EXCLUDE_ENTRY = 'daha.config.ts';

export interface InitOptions {
  /** Skip prompts and apply recommended defaults. */
  yes?: boolean;
  /** Force excluding daha.config.ts from tsconfig.json. */
  excludeTsconfig?: boolean;
  /** Skip tsconfig.json updates. */
  noExcludeTsconfig?: boolean;
}

/**
 * Initializes a default configuration file and project scaffolding helpers.
 */
export async function handleInitCommand(options: InitOptions = {}): Promise<void> {
  const projectDir = process.cwd();
  const targetPath = path.join(projectDir, 'daha.config.ts');

  if (await fs.pathExists(targetPath)) {
    console.log(chalk.yellow(`\n⚠️  Configuration file already exists at ${targetPath}`));
    console.log(chalk.gray('Abort initialization. Delete the existing file or rename it first.\n'));
    return;
  }

  try {
    await fs.writeFile(targetPath, DEFAULT_CONFIG_TEMPLATE, 'utf8');
    console.log(chalk.green(`\n✓ Successfully initialized Daha configuration file!`));
    console.log(chalk.white(`Created config at: ${chalk.bold(targetPath)}`));

    const gitignoreResult = await ensureGitignoreEntry(projectDir);
    printGitignoreResult(gitignoreResult);

    const shouldExclude = await resolveExcludeTsconfig(options);
    if (shouldExclude) {
      const tsconfigResult = await ensureTsconfigExclude(projectDir);
      printTsconfigResult(tsconfigResult);
    } else {
      console.log(chalk.dim('Skipped tsconfig.json update.'));
    }

    printNextSteps();
  } catch (error: any) {
    console.error(chalk.red(`Failed to initialize Daha: ${error.message}`));
    process.exit(1);
  }
}

export type GitignoreResult =
  | { status: 'created' }
  | { status: 'updated' }
  | { status: 'exists' }
  | { status: 'skipped'; reason: string };

/**
 * Ensures `.daha/` is listed in `.gitignore`.
 */
export async function ensureGitignoreEntry(projectDir: string): Promise<GitignoreResult> {
  const gitignorePath = path.join(projectDir, '.gitignore');

  if (!(await fs.pathExists(gitignorePath))) {
    await fs.writeFile(gitignorePath, `# daha\n${GITIGNORE_ENTRY}\n`, 'utf8');
    return { status: 'created' };
  }

  const content = await fs.readFile(gitignorePath, 'utf8');
  if (hasGitignoreDahaEntry(content)) {
    return { status: 'exists' };
  }

  const separator = content.length === 0 || content.endsWith('\n') ? '' : '\n';
  const block = `${separator}\n# daha\n${GITIGNORE_ENTRY}\n`;
  await fs.writeFile(gitignorePath, content + block, 'utf8');
  return { status: 'updated' };
}

export function hasGitignoreDahaEntry(content: string): boolean {
  return content
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim();
      return (
        trimmed === '.daha' ||
        trimmed === '.daha/' ||
        trimmed === '**/.daha' ||
        trimmed === '**/.daha/' ||
        trimmed === '/.daha' ||
        trimmed === '/.daha/'
      );
    });
}

export type TsconfigResult =
  | { status: 'updated' }
  | { status: 'exists' }
  | { status: 'missing' }
  | { status: 'skipped'; reason: string };

/**
 * Ensures `daha.config.ts` is listed in tsconfig.json `exclude`.
 */
export async function ensureTsconfigExclude(projectDir: string): Promise<TsconfigResult> {
  const tsconfigPath = path.join(projectDir, 'tsconfig.json');

  if (!(await fs.pathExists(tsconfigPath))) {
    return { status: 'missing' };
  }

  const raw = await fs.readFile(tsconfigPath, 'utf8');

  let parsed: any;
  try {
    parsed = parseJsonc(raw);
  } catch {
    return { status: 'skipped', reason: 'Could not parse tsconfig.json (invalid JSON/JSONC).' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { status: 'skipped', reason: 'tsconfig.json root must be an object.' };
  }

  const exclude = Array.isArray(parsed.exclude) ? [...parsed.exclude] : [];
  if (exclude.includes(TSCONFIG_EXCLUDE_ENTRY)) {
    return { status: 'exists' };
  }

  exclude.push(TSCONFIG_EXCLUDE_ENTRY);
  parsed.exclude = exclude;

  // Preserve formatting lightly by rewriting with stable 2-space indent.
  await fs.writeFile(tsconfigPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return { status: 'updated' };
}

/**
 * Minimal JSONC parser for tsconfig (comments + trailing commas).
 */
export function parseJsonc(text: string): unknown {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([\]}])/g, '$1');
  return JSON.parse(stripped);
}

async function resolveExcludeTsconfig(options: InitOptions): Promise<boolean> {
  if (options.noExcludeTsconfig) {
    return false;
  }
  if (options.excludeTsconfig) {
    return true;
  }
  if (options.yes) {
    return true;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  return promptYesNo(
    'Exclude daha.config.ts from tsconfig.json so Next.js/tsc ignore it?',
    true
  );
}

async function promptYesNo(question: string, defaultYes: boolean): Promise<boolean> {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const answer = await new Promise<string>((resolve) => {
      rl.question(`${chalk.cyan('?')} ${question} (${hint}) `, resolve);
    });
    const normalized = answer.trim().toLowerCase();
    if (!normalized) {
      return defaultYes;
    }
    return normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
}

function printGitignoreResult(result: GitignoreResult): void {
  if (result.status === 'created') {
    console.log(chalk.green(`✓ Created .gitignore with ${GITIGNORE_ENTRY}`));
  } else if (result.status === 'updated') {
    console.log(chalk.green(`✓ Added ${GITIGNORE_ENTRY} to .gitignore`));
  } else if (result.status === 'exists') {
    console.log(chalk.dim(`✓ .gitignore already ignores ${GITIGNORE_ENTRY}`));
  } else {
    console.log(chalk.yellow(`⚠️  Skipped .gitignore update: ${result.reason}`));
  }
}

function printTsconfigResult(result: TsconfigResult): void {
  if (result.status === 'updated') {
    console.log(chalk.green(`✓ Added ${TSCONFIG_EXCLUDE_ENTRY} to tsconfig.json exclude`));
  } else if (result.status === 'exists') {
    console.log(chalk.dim(`✓ tsconfig.json already excludes ${TSCONFIG_EXCLUDE_ENTRY}`));
  } else if (result.status === 'missing') {
    console.log(chalk.dim('No tsconfig.json found — skipped TypeScript exclude.'));
  } else {
    console.log(chalk.yellow(`⚠️  Skipped tsconfig.json update: ${result.reason}`));
  }
}

function printNextSteps(): void {
  console.log(chalk.bold.cyan('\nNext steps'));
  console.log(chalk.white('  1. Install the Chromium browser Daha uses for Lighthouse:'));
  console.log(chalk.cyan('       npx daha setup'));
  console.log(chalk.white('  2. Confirm discovered routes:'));
  console.log(chalk.cyan('       npx daha routes'));
  console.log(chalk.white('  3. Run your first audit:'));
  console.log(chalk.cyan('       npx daha audit'));
  console.log(chalk.dim('\n  Tip: use `npx daha audit --dev -r /` against a running local server.\n'));
}
