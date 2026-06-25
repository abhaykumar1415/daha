import { describe, it, expect } from 'vitest';
import { 
  getMedianRun, 
  calculateAverages, 
  analyzeRouteRuns 
} from '../src/analyzer/index.js';
import { AuditResult, VitixConfig } from '../src/types/config.js';

const mockRuns: AuditResult[] = [
  {
    url: 'http://localhost:3000/',
    route: '/',
    timestamp: '2026-06-25T12:00:00.000Z',
    preset: 'mobile',
    scores: { performance: 80, accessibility: 95, 'best-practices': 90, seo: 100 },
    metrics: { FCP: 1200, LCP: 2600, CLS: 0.12, FID: 50, INP: 150, TBT: 400, TTFB: 300 },
    lighthouseReportPath: 'report_run1.html',
    runIndex: 1
  },
  {
    url: 'http://localhost:3000/',
    route: '/',
    timestamp: '2026-06-25T12:01:00.000Z',
    preset: 'mobile',
    scores: { performance: 95, accessibility: 93, 'best-practices': 92, seo: 98 },
    metrics: { FCP: 1000, LCP: 1800, CLS: 0.08, FID: 40, INP: 120, TBT: 100, TTFB: 200 },
    lighthouseReportPath: 'report_run2.html',
    runIndex: 2
  },
  {
    url: 'http://localhost:3000/',
    route: '/',
    timestamp: '2026-06-25T12:02:00.000Z',
    preset: 'mobile',
    scores: { performance: 90, accessibility: 91, 'best-practices': 94, seo: 96 },
    metrics: { FCP: 1100, LCP: 2200, CLS: 0.10, FID: 45, INP: 130, TBT: 200, TTFB: 250 },
    lighthouseReportPath: 'report_run3.html',
    runIndex: 3
  }
];

describe('Threshold Analyzer', () => {
  describe('getMedianRun', () => {
    it('should select the run with the median performance score', () => {
      // Scores: 80 (run 1), 95 (run 2), 90 (run 3)
      // Sorted: 80 (run 1), 90 (run 3), 95 (run 2)
      // Median: index 1 -> run 3 (score 90)
      const median = getMedianRun(mockRuns);
      expect(median.runIndex).toBe(3);
      expect(median.scores.performance).toBe(90);
    });
  });

  describe('calculateAverages', () => {
    it('should compute mathematical averages across all runs', () => {
      const avg = calculateAverages(mockRuns);
      
      // Performance: (80 + 95 + 90) / 3 = 88.33 -> 88
      expect(avg.scores.performance).toBe(88);
      
      // Accessibility: (95 + 93 + 91) / 3 = 93
      expect(avg.scores.accessibility).toBe(93);

      // LCP: (2600 + 1800 + 2200) / 3 = 2200
      expect(avg.metrics.LCP).toBe(2200);

      // CLS: (0.12 + 0.08 + 0.10) / 3 = 0.10
      expect(avg.metrics.CLS).toBe(0.10);
    });
  });

  describe('analyzeRouteRuns', () => {
    const config: VitixConfig = {
      routes: 'auto',
      thresholds: {
        categories: {
          performance: 85,
          accessibility: 90,
        },
        metrics: {
          LCP: { max: 2500 },
          CLS: { max: 0.15 }
        }
      },
      options: {
        numberOfRuns: 3,
        preset: 'mobile',
        concurrency: 1,
        timeoutMs: 60000,
        chromeFlags: [],
      },
      build: { command: 'npm run build', dir: '.next' },
      server: { command: 'npm run start' },
      output: { dir: '.vitix', formats: ['html'] }
    };

    it('should pass if median run meets all thresholds', () => {
      // Median run (run 3):
      // Perf: 90 (threshold >= 85) -> Pass
      // A11y: 91 (threshold >= 90) -> Pass
      // LCP: 2200 (threshold <= 2500) -> Pass
      // CLS: 0.10 (threshold <= 0.15) -> Pass
      const summary = analyzeRouteRuns('/', 'http://localhost:3000/', mockRuns, config);
      expect(summary.passed).toBe(true);
      expect(summary.violations.length).toBe(0);
    });

    it('should fail and record violations if category score is too low', () => {
      const strictConfig = {
        ...config,
        thresholds: {
          ...config.thresholds,
          categories: {
            performance: 95, // Median is 90, so this will fail
          }
        }
      };

      const summary = analyzeRouteRuns('/', 'http://localhost:3000/', mockRuns, strictConfig);
      expect(summary.passed).toBe(false);
      expect(summary.violations[0]).toContain('Category "performance" score of 90 is below threshold of 95');
    });

    it('should fail and record violations if core web vital exceeds max threshold', () => {
      const strictConfig = {
        ...config,
        thresholds: {
          ...config.thresholds,
          metrics: {
            LCP: { max: 2000 } // Median is 2200, so this will fail
          }
        }
      };

      const summary = analyzeRouteRuns('/', 'http://localhost:3000/', mockRuns, strictConfig);
      expect(summary.passed).toBe(false);
      expect(summary.violations[0]).toContain('Metric "LCP" value of 2200ms exceeds maximum threshold of 2000ms');
    });

    it('should pass if resources are within budgets', () => {
      const runsWithResources: AuditResult[] = mockRuns.map(run => ({
        ...run,
        resources: {
          totalJsSizeKb: 100,
          totalCssSizeKb: 20,
          totalImageSizeKb: 150,
          thirdPartyRequests: 5,
        }
      }));

      const budgetConfig = {
        ...config,
        thresholds: {
          ...config.thresholds,
          budgets: {
            maxTotalJsSizeKb: 150,
            maxTotalCssSizeKb: 30,
            maxTotalImageSizeKb: 200,
            maxThirdPartyRequests: 10,
          }
        }
      };

      const summary = analyzeRouteRuns('/', 'http://localhost:3000/', runsWithResources, budgetConfig as any);
      expect(summary.passed).toBe(true);
      expect(summary.violations.length).toBe(0);
    });

    it('should fail and report violations when resources exceed budgets', () => {
      const runsWithResources: AuditResult[] = mockRuns.map(run => ({
        ...run,
        resources: {
          totalJsSizeKb: 200,
          totalCssSizeKb: 50,
          totalImageSizeKb: 300,
          thirdPartyRequests: 15,
        }
      }));

      const budgetConfig = {
        ...config,
        thresholds: {
          ...config.thresholds,
          budgets: {
            maxTotalJsSizeKb: 150,
            maxTotalCssSizeKb: 30,
            maxTotalImageSizeKb: 200,
            maxThirdPartyRequests: 10,
          }
        }
      };

      const summary = analyzeRouteRuns('/', 'http://localhost:3000/', runsWithResources, budgetConfig as any);
      expect(summary.passed).toBe(false);
      expect(summary.violations).toContain('Total JS bundle size of 200KB exceeds the budget limit of 150KB.');
      expect(summary.violations).toContain('Total CSS bundle size of 50KB exceeds the budget limit of 30KB.');
      expect(summary.violations).toContain('Total images transfer size of 300KB exceeds the budget limit of 200KB.');
      expect(summary.violations).toContain('Total third-party requests count of 15 exceeds the budget limit of 10.');
    });
  });
});
