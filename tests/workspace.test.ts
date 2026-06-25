import { describe, it, expect, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { findWorkspacePackages, generateWorkspaceHtml, PackageResult } from '../src/cli/workspace.js';

describe('Monorepo Workspace Scanner & Report Generator', () => {
  const tempTestDir = path.resolve('./temp-workspace-test');

  afterEach(async () => {
    if (await fs.pathExists(tempTestDir)) {
      await fs.remove(tempTestDir);
    }
  });

  describe('findWorkspacePackages', () => {
    it('should discover packages registered in package.json workspaces list', async () => {
      // 1. Setup workspace structure
      await fs.ensureDir(tempTestDir);
      
      const rootPkgJson = {
        name: 'root-monorepo',
        private: true,
        workspaces: ['apps/*', 'packages/pkg-a']
      };
      await fs.outputJson(path.join(tempTestDir, 'package.json'), rootPkgJson);

      // Create child directories
      const app1 = path.join(tempTestDir, 'apps/app-1');
      const app2 = path.join(tempTestDir, 'apps/app-2');
      const pkgA = path.join(tempTestDir, 'packages/pkg-a');
      const ignoredDir = path.join(tempTestDir, 'apps/ignored-no-config');

      await fs.ensureDir(app1);
      await fs.ensureDir(app2);
      await fs.ensureDir(pkgA);
      await fs.ensureDir(ignoredDir);

      // Write daha.config.ts to target packages
      await fs.outputFile(path.join(app1, 'daha.config.ts'), 'export default {}');
      await fs.outputFile(path.join(app2, 'daha.config.js'), 'module.exports = {}');
      await fs.outputFile(path.join(pkgA, '.daharc.yaml'), 'thresholds: {}');

      // Call scanner
      const foundPackages = await findWorkspacePackages(tempTestDir);

      // Normalize paths to match regardless of OS / casing differences
      const normalizedFound = foundPackages.map(p => path.relative(tempTestDir, p).replace(/\\/g, '/'));

      expect(normalizedFound).toContain('apps/app-1');
      expect(normalizedFound).toContain('apps/app-2');
      expect(normalizedFound).toContain('packages/pkg-a');
      expect(normalizedFound).not.toContain('apps/ignored-no-config');
    });

    it('should discover packages defined in pnpm-workspace.yaml', async () => {
      await fs.ensureDir(tempTestDir);
      
      const pnpmWorkspaceYaml = `
packages:
  - 'packages/*'
  - '!packages/excluded'
`;
      await fs.outputFile(path.join(tempTestDir, 'pnpm-workspace.yaml'), pnpmWorkspaceYaml);

      const pkg1 = path.join(tempTestDir, 'packages/pkg-1');
      const excluded = path.join(tempTestDir, 'packages/excluded');

      await fs.ensureDir(pkg1);
      await fs.ensureDir(excluded);

      await fs.outputFile(path.join(pkg1, 'daha.config.ts'), 'export default {}');
      await fs.outputFile(path.join(excluded, 'daha.config.ts'), 'export default {}');

      const foundPackages = await findWorkspacePackages(tempTestDir);
      const normalizedFound = foundPackages.map(p => path.relative(tempTestDir, p).replace(/\\/g, '/'));

      expect(normalizedFound).toContain('packages/pkg-1');
      expect(normalizedFound).not.toContain('packages/excluded');
    });

    it('should fallback to scanning direct folders containing daha configs if no workspaces defined', async () => {
      await fs.ensureDir(tempTestDir);

      const projectA = path.join(tempTestDir, 'project-a');
      const projectB = path.join(tempTestDir, 'nested/project-b');
      
      await fs.ensureDir(projectA);
      await fs.ensureDir(projectB);

      await fs.outputFile(path.join(projectA, 'daha.config.ts'), '');
      await fs.outputFile(path.join(projectB, 'daha.config.js'), '');

      const foundPackages = await findWorkspacePackages(tempTestDir);
      const normalizedFound = foundPackages.map(p => path.relative(tempTestDir, p).replace(/\\/g, '/'));

      expect(normalizedFound).toContain('project-a');
      expect(normalizedFound).toContain('nested/project-b');
    });
  });

  describe('generateWorkspaceHtml', () => {
    it('should generate a valid HTML report with correct overall statistics and package details', () => {
      const mockResults: PackageResult[] = [
        {
          name: 'app-a',
          dir: '/usr/src/app/packages/app-a',
          passed: true,
          summary: {
            timestamp: '2026-06-25T14:00:00.000Z',
            durationMs: 4000,
            passed: true,
            routes: [
              {
                route: '/',
                url: 'http://localhost:3000/',
                preset: 'mobile',
                passed: true,
                violations: [],
                averageScores: { performance: 95, accessibility: 95, 'best-practices': 95, seo: 100 },
                averageMetrics: { FCP: 1000, LCP: 1200, CLS: 0.01, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
                runs: [],
                medianRun: {
                  url: 'http://localhost:3000/',
                  route: '/',
                  timestamp: '2026-06-25T14:00:00.000Z',
                  preset: 'mobile',
                  runIndex: 1,
                  scores: { performance: 95, accessibility: 95, 'best-practices': 95, seo: 100 },
                  metrics: { FCP: 1000, LCP: 1200, CLS: 0.01, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
                  lighthouseReportPath: ''
                }
              }
            ]
          }
        },
        {
          name: 'app-b',
          dir: '/usr/src/app/packages/app-b',
          passed: false,
          summary: null,
          error: 'Next.js build command failed.'
        }
      ];

      const html = generateWorkspaceHtml(mockResults, '/usr/src/app', 5000);

      // Check stats cards
      expect(html).toContain('<h3>Total Packages</h3>');
      expect(html).toContain('<div class="value" style="color: var(--primary);">2</div>');
      expect(html).toContain('<h3>Passed Packages</h3>');
      expect(html).toContain('<div class="value" style="color: var(--passed-color);">1</div>');
      expect(html).toContain('<h3>Failed Packages</h3>');
      expect(html).toContain('<div class="value" style="color: var(--failed-color);">1</div>');

      // Check package cards
      expect(html).toContain('<h3>app-a</h3>');
      expect(html).toContain('<h3>app-b</h3>');
      expect(html).toContain('PASSED');
      expect(html).toContain('FAILED');
      expect(html).toContain('Next.js build command failed.');

      // Check average scores in app-a card
      expect(html).toContain('<span class="score-val" style="color: #10b981">95</span>');
    });
  });
});
