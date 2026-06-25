import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { execa } from 'execa';

export async function handleInitHooksCommand(): Promise<void> {
  const projectDir = process.cwd();
  const gitDir = path.join(projectDir, '.git');

  if (!await fs.pathExists(gitDir)) {
    console.error(chalk.red('\nError: This directory is not a Git repository.'));
    console.log(chalk.gray('Please run `git init` first to initialize Git in your project.\n'));
    process.exit(1);
  }

  // 1. Check if Husky is used
  const huskyDir = path.join(projectDir, '.husky');
  if (await fs.pathExists(huskyDir)) {
    const huskyPreCommitPath = path.join(huskyDir, 'pre-commit');
    const huskyHookContent = 'npx vitix check\n';

    try {
      if (await fs.pathExists(huskyPreCommitPath)) {
        const existing = await fs.readFile(huskyPreCommitPath, 'utf8');
        if (!existing.includes('vitix check')) {
          await fs.appendFile(huskyPreCommitPath, `\n${huskyHookContent}`);
          console.log(chalk.green('\n✓ Appended Vitix check to existing Husky pre-commit hook.'));
        } else {
          console.log(chalk.yellow('\n⚠️  Vitix check is already present in your Husky pre-commit hook.'));
        }
      } else {
        await fs.writeFile(huskyPreCommitPath, `#!/bin/sh\n. "$(dirname "$0")/_/husky.sh"\n\n${huskyHookContent}`, { mode: 0o755 });
        console.log(chalk.green('\n✓ Created new Husky pre-commit hook for Vitix check.'));
      }
      console.log(chalk.white(`Configured: ${chalk.bold(huskyPreCommitPath)}\n`));
      return;
    } catch (err: any) {
      console.error(chalk.red(`Failed to write Husky pre-commit hook: ${err.message}`));
      process.exit(1);
    }
  }

  // 2. Fallback to native Git pre-commit hook
  const gitHooksDir = path.join(gitDir, 'hooks');
  await fs.ensureDir(gitHooksDir);
  const nativePreCommitPath = path.join(gitHooksDir, 'pre-commit');

  const nativeHookContent = `#!/bin/sh
# Vitix Pre-commit Performance Threshold Check
echo "Checking Vitix performance budgets..."
npx vitix check
if [ $? -ne 0 ]; then
  echo "❌ Vitix performance check failed. Commit aborted."
  exit 1
fi
echo "✓ Vitix performance checks passed."
`;

  try {
    if (await fs.pathExists(nativePreCommitPath)) {
      const existing = await fs.readFile(nativePreCommitPath, 'utf8');
      if (!existing.includes('vitix check')) {
        // Backup existing
        await fs.writeFile(`${nativePreCommitPath}.bak`, existing);
        await fs.writeFile(nativePreCommitPath, existing + '\n' + nativeHookContent.replace('#!/bin/sh\n', ''), { mode: 0o755 });
        console.log(chalk.green('\n✓ Integrated Vitix check into your existing pre-commit hook (backed up to pre-commit.bak).'));
      } else {
        console.log(chalk.yellow('\n⚠️  Vitix check is already integrated in your Git pre-commit hook.'));
      }
    } else {
      await fs.writeFile(nativePreCommitPath, nativeHookContent, { mode: 0o755 });
      console.log(chalk.green('\n✓ Created native Git pre-commit hook containing Vitix check.'));
    }

    // Ensure executable on Unix systems
    if (process.platform !== 'win32') {
      try {
        await execa('chmod', ['+x', nativePreCommitPath]);
      } catch {
        // Ignore chmod failure if command not available
      }
    }

    console.log(chalk.white(`Configured: ${chalk.bold(nativePreCommitPath)}\n`));
  } catch (err: any) {
    console.error(chalk.red(`Failed to write Git pre-commit hook: ${err.message}`));
    process.exit(1);
  }
}
