import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import {
  ensureGitignoreEntry,
  ensureTsconfigExclude,
  hasGitignoreDahaEntry,
  parseJsonc,
  handleInitCommand,
} from '../src/cli/init.js';

const TEST_DIR = path.resolve(process.cwd(), 'tests/temp_init_test');

describe('daha init scaffolding helpers', () => {
  beforeEach(async () => {
    await fs.remove(TEST_DIR);
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  describe('hasGitignoreDahaEntry', () => {
    it('detects common .daha ignore patterns', () => {
      expect(hasGitignoreDahaEntry('.daha/\n')).toBe(true);
      expect(hasGitignoreDahaEntry('.daha\n')).toBe(true);
      expect(hasGitignoreDahaEntry('**/.daha/\n')).toBe(true);
      expect(hasGitignoreDahaEntry('node_modules\n')).toBe(false);
    });
  });

  describe('ensureGitignoreEntry', () => {
    it('creates .gitignore when missing', async () => {
      const result = await ensureGitignoreEntry(TEST_DIR);
      expect(result.status).toBe('created');
      const content = await fs.readFile(path.join(TEST_DIR, '.gitignore'), 'utf8');
      expect(content).toContain('.daha/');
    });

    it('appends .daha/ when not present', async () => {
      await fs.writeFile(path.join(TEST_DIR, '.gitignore'), 'node_modules\n', 'utf8');
      const result = await ensureGitignoreEntry(TEST_DIR);
      expect(result.status).toBe('updated');
      const content = await fs.readFile(path.join(TEST_DIR, '.gitignore'), 'utf8');
      expect(content).toContain('node_modules');
      expect(content).toContain('.daha/');
    });

    it('is a no-op when already present', async () => {
      await fs.writeFile(path.join(TEST_DIR, '.gitignore'), '.daha/\n', 'utf8');
      const result = await ensureGitignoreEntry(TEST_DIR);
      expect(result.status).toBe('exists');
    });
  });

  describe('ensureTsconfigExclude', () => {
    it('returns missing when tsconfig.json is absent', async () => {
      const result = await ensureTsconfigExclude(TEST_DIR);
      expect(result.status).toBe('missing');
    });

    it('adds daha.config.ts to exclude', async () => {
      await fs.writeJson(path.join(TEST_DIR, 'tsconfig.json'), {
        compilerOptions: { strict: true },
        exclude: ['node_modules'],
      });

      const result = await ensureTsconfigExclude(TEST_DIR);
      expect(result.status).toBe('updated');

      const parsed = await fs.readJson(path.join(TEST_DIR, 'tsconfig.json'));
      expect(parsed.exclude).toEqual(['node_modules', 'daha.config.ts']);
    });

    it('creates exclude array when absent', async () => {
      await fs.writeJson(path.join(TEST_DIR, 'tsconfig.json'), {
        compilerOptions: { strict: true },
      });

      const result = await ensureTsconfigExclude(TEST_DIR);
      expect(result.status).toBe('updated');

      const parsed = await fs.readJson(path.join(TEST_DIR, 'tsconfig.json'));
      expect(parsed.exclude).toEqual(['daha.config.ts']);
    });

    it('is a no-op when already excluded', async () => {
      await fs.writeJson(path.join(TEST_DIR, 'tsconfig.json'), {
        exclude: ['node_modules', 'daha.config.ts'],
      });
      const result = await ensureTsconfigExclude(TEST_DIR);
      expect(result.status).toBe('exists');
    });

    it('parses JSONC with comments and trailing commas', () => {
      const parsed = parseJsonc(`{
        // comment
        "exclude": ["node_modules",],
      }`) as { exclude: string[] };
      expect(parsed.exclude).toEqual(['node_modules']);
    });
  });

  describe('handleInitCommand', () => {
    it('creates config, gitignore, and tsconfig exclude with --yes', async () => {
      await fs.writeFile(path.join(TEST_DIR, '.gitignore'), 'node_modules\n', 'utf8');
      await fs.writeJson(path.join(TEST_DIR, 'tsconfig.json'), {
        exclude: ['node_modules'],
      });

      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
      try {
        await handleInitCommand({ yes: true });

        expect(await fs.pathExists(path.join(TEST_DIR, 'daha.config.ts'))).toBe(true);
        const gitignore = await fs.readFile(path.join(TEST_DIR, '.gitignore'), 'utf8');
        expect(gitignore).toContain('.daha/');
        const tsconfig = await fs.readJson(path.join(TEST_DIR, 'tsconfig.json'));
        expect(tsconfig.exclude).toContain('daha.config.ts');
      } finally {
        cwdSpy.mockRestore();
      }
    });

    it('skips tsconfig when --no-exclude-tsconfig is set', async () => {
      await fs.writeJson(path.join(TEST_DIR, 'tsconfig.json'), {
        exclude: ['node_modules'],
      });

      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
      try {
        await handleInitCommand({ noExcludeTsconfig: true });
        const tsconfig = await fs.readJson(path.join(TEST_DIR, 'tsconfig.json'));
        expect(tsconfig.exclude).toEqual(['node_modules']);
      } finally {
        cwdSpy.mockRestore();
      }
    });
  });
});
