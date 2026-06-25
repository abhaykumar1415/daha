import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { compareWithBaseline } from '../src/reporter/index.js';
import { VitixRunSummary, ParsedVitixConfig } from '../src/types/config.js';

const TEST_DIR = path.resolve(process.cwd(), 'tests/temp_ci_test');

describe('CI Regression Checks', () => {
  const baselineJsonPath = path.join(TEST_DIR, 'summary.json');
  
  const mockConfig: ParsedVitixConfig = {
    routes: 'auto',
    thresholds: {},
    options: { numberOfRuns: 3, preset: 'mobile', concurrency: 1, timeoutMs: 60000, chromeFlags: [], framework: 'auto' },
    build: { command: 'npm run build', dir: '.next' },
    server: { command: 'npm run start' },
    output: { dir: '.vitix', formats: ['json'], openReport: false },
    ci: {
      strict: true,
      junit: true,
      maxPerformanceRegressionPercent: 5, // Max 5% drop
      maxMetricRegressionPercent: {
        LCP: 10, // Max 10% LCP increase
      }
    }
  };

  // Mock baseline run
  const mockBaseline: VitixRunSummary = {
    timestamp: '2026-06-25T12:00:00.000Z',
    durationMs: 10000,
    passed: true,
    routes: [
      {
        route: '/',
        url: 'http://localhost:3000/',
        preset: 'mobile',
        passed: true,
        violations: [],
        averageScores: { performance: 90, accessibility: 90, 'best-practices': 90, seo: 90 },
        averageMetrics: { FCP: 1000, LCP: 2000, CLS: 0, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
        runs: [],
        medianRun: {
          url: 'http://localhost:3000/',
          route: '/',
          timestamp: '2026-06-25T12:00:00.000Z',
          preset: 'mobile',
          runIndex: 1,
          scores: { performance: 90, accessibility: 90, 'best-practices': 90, seo: 90 },
          metrics: { FCP: 1000, LCP: 2000, CLS: 0, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
          lighthouseReportPath: ''
        }
      }
    ]
  };

  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
    await fs.writeJson(baselineJsonPath, mockBaseline);
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
  });

  it('should pass if regression is within tolerances', async () => {
    const currentRun: VitixRunSummary = {
      timestamp: '2026-06-25T13:00:00.000Z',
      durationMs: 10000,
      passed: true,
      routes: [
        {
          route: '/',
          url: 'http://localhost:3000/',
          preset: 'mobile',
          passed: true,
          violations: [],
          averageScores: { performance: 88, accessibility: 90, 'best-practices': 90, seo: 90 }, // 88 vs 90 is 2.2% drop (< 5%)
          averageMetrics: { FCP: 1000, LCP: 2100, CLS: 0, FID: 0, INP: 0, TBT: 0, TTFB: 0 }, // 2100 vs 2000 is 5% increase (< 10%)
          runs: [
            {
              url: 'http://localhost:3000/',
              route: '/',
              timestamp: '2026-06-25T13:00:00.000Z',
              preset: 'mobile',
              runIndex: 1,
              scores: { performance: 88, accessibility: 90, 'best-practices': 90, seo: 90 },
              metrics: { FCP: 1000, LCP: 2100, CLS: 0, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
              lighthouseReportPath: ''
            }
          ],
          medianRun: {
            url: 'http://localhost:3000/',
            route: '/',
            timestamp: '2026-06-25T13:00:00.000Z',
            preset: 'mobile',
            runIndex: 1,
            scores: { performance: 88, accessibility: 90, 'best-practices': 90, seo: 90 },
            metrics: { FCP: 1000, LCP: 2100, CLS: 0, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
            lighthouseReportPath: ''
          }
        }
      ]
    };

    const diffs = await compareWithBaseline(currentRun, TEST_DIR, mockConfig);
    expect(diffs).toBeDefined();
    expect(currentRun.passed).toBe(true);
    expect(currentRun.routes[0].passed).toBe(true);
    expect(currentRun.routes[0].violations.length).toBe(0);
  });

  it('should fail and report violation when performance drop exceeds category limits', async () => {
    const currentRun: VitixRunSummary = {
      timestamp: '2026-06-25T13:00:00.000Z',
      durationMs: 10000,
      passed: true,
      routes: [
        {
          route: '/',
          url: 'http://localhost:3000/',
          preset: 'mobile',
          passed: true,
          violations: [],
          averageScores: { performance: 80, accessibility: 90, 'best-practices': 90, seo: 90 }, // 80 vs 90 is 11% drop (> 5%)
          averageMetrics: { FCP: 1000, LCP: 2000, CLS: 0, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
          runs: [
            {
              url: 'http://localhost:3000/',
              route: '/',
              timestamp: '2026-06-25T13:00:00.000Z',
              preset: 'mobile',
              runIndex: 1,
              scores: { performance: 80, accessibility: 90, 'best-practices': 90, seo: 90 },
              metrics: { FCP: 1000, LCP: 2000, CLS: 0, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
              lighthouseReportPath: ''
            }
          ],
          medianRun: {
            url: 'http://localhost:3000/',
            route: '/',
            timestamp: '2026-06-25T13:00:00.000Z',
            preset: 'mobile',
            runIndex: 1,
            scores: { performance: 80, accessibility: 90, 'best-practices': 90, seo: 90 },
            metrics: { FCP: 1000, LCP: 2000, CLS: 0, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
            lighthouseReportPath: ''
          }
        }
      ]
    };

    await compareWithBaseline(currentRun, TEST_DIR, mockConfig);
    expect(currentRun.passed).toBe(false);
    expect(currentRun.routes[0].passed).toBe(false);
    expect(currentRun.routes[0].violations[0]).toContain('Performance score regressed by 11%');
  });

  it('should fail and report violation when metric increase exceeds limits', async () => {
    const currentRun: VitixRunSummary = {
      timestamp: '2026-06-25T13:00:00.000Z',
      durationMs: 10000,
      passed: true,
      routes: [
        {
          route: '/',
          url: 'http://localhost:3000/',
          preset: 'mobile',
          passed: true,
          violations: [],
          averageScores: { performance: 90, accessibility: 90, 'best-practices': 90, seo: 90 },
          averageMetrics: { FCP: 1000, LCP: 2300, CLS: 0, FID: 0, INP: 0, TBT: 0, TTFB: 0 }, // 2300 vs 2000 is 15% increase (> 10%)
          runs: [
            {
              url: 'http://localhost:3000/',
              route: '/',
              timestamp: '2026-06-25T13:00:00.000Z',
              preset: 'mobile',
              runIndex: 1,
              scores: { performance: 90, accessibility: 90, 'best-practices': 90, seo: 90 },
              metrics: { FCP: 1000, LCP: 2300, CLS: 0, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
              lighthouseReportPath: ''
            }
          ],
          medianRun: {
            url: 'http://localhost:3000/',
            route: '/',
            timestamp: '2026-06-25T13:00:00.000Z',
            preset: 'mobile',
            runIndex: 1,
            scores: { performance: 90, accessibility: 90, 'best-practices': 90, seo: 90 },
            metrics: { FCP: 1000, LCP: 2300, CLS: 0, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
            lighthouseReportPath: ''
          }
        }
      ]
    };

    await compareWithBaseline(currentRun, TEST_DIR, mockConfig);
    expect(currentRun.passed).toBe(false);
    expect(currentRun.routes[0].passed).toBe(false);
    expect(currentRun.routes[0].violations[0]).toContain('Metric "LCP" value regressed by 15%');
  });
});
