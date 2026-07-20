import chalk from 'chalk';
import {
  getChromiumExecutablePath,
  installChromium,
  isChromiumInstalled,
  isChromiumUsable,
} from '../utils/browsers.js';

export interface SetupOptions {
  force?: boolean;
}

/**
 * Installs Playwright Chromium required by Daha audits.
 */
export async function handleSetupCommand(options: SetupOptions = {}): Promise<void> {
  console.log(chalk.bold.cyan('\n🔧 Daha Setup\n'));

  try {
    const alreadyUsable = !options.force && (await isChromiumUsable());

    if (alreadyUsable) {
      console.log(chalk.green('✓ Playwright Chromium is already installed.'));
      if (isChromiumInstalled()) {
        console.log(chalk.dim(`  ${getChromiumExecutablePath()}`));
      }
      console.log(chalk.dim('\nUse `daha setup --force` to reinstall.\n'));
      return;
    }

    if (options.force) {
      console.log(chalk.blue('Force-reinstalling Playwright Chromium...\n'));
    } else {
      console.log(chalk.white('Downloading Playwright Chromium for Lighthouse audits...\n'));
    }

    await installChromium({ force: !!options.force });

    if (await isChromiumUsable()) {
      console.log(chalk.green('\n✓ Daha is ready to run audits.'));
      if (isChromiumInstalled()) {
        console.log(chalk.dim(`  ${getChromiumExecutablePath()}`));
      }
      console.log('');
    } else {
      console.log(chalk.red('\n❌ Setup completed but Chromium could not be launched.'));
      console.log(chalk.dim('  Try: npx playwright install chromium\n'));
      process.exitCode = 1;
    }
  } catch (error: any) {
    console.error(chalk.red(`\n❌ Setup failed: ${error.message}\n`));
    process.exitCode = 1;
  }
}
