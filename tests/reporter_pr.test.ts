import { describe, it, expect } from 'vitest';
import { generatePrCommentMarkdown } from '../src/reporter/index.js';
import { VitixRunSummary } from '../src/types/config.js';

describe('PR Comment Markdown Exporter', () => {
  it('should generate a formatted markdown report matching PR comment conventions', () => {
    const mockSummary: VitixRunSummary = {
      timestamp: '2026-06-25T14:00:00.000Z',
      durationMs: 15300,
      passed: false,
      routes: [
        {
          route: '/',
          url: 'http://localhost:3000/',
          preset: 'mobile',
          passed: false,
          violations: [
            'Category "performance" score of 80 is below threshold of 90.',
            'Metric "LCP" value of 2800ms exceeds maximum threshold of 2500ms.'
          ],
          averageScores: { performance: 80, accessibility: 90, 'best-practices': 95, seo: 100 },
          averageMetrics: { FCP: 1200, LCP: 2800, CLS: 0.05, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
          runs: [],
          medianRun: {
            url: 'http://localhost:3000/',
            route: '/',
            timestamp: '2026-06-25T14:00:00.000Z',
            preset: 'mobile',
            runIndex: 1,
            scores: { performance: 80, accessibility: 90, 'best-practices': 95, seo: 100 },
            metrics: { FCP: 1200, LCP: 2800, CLS: 0.05, FID: 0, INP: 0, TBT: 0, TTFB: 0 },
            lighthouseReportPath: ''
          }
        }
      ],
      baselineDiffs: {
        '/ [mobile]': {
          'category:performance': { current: 80, baseline: 90, diff: -10, diffPercent: -11 },
          'metric:LCP': { current: 2800, baseline: 2000, diff: 800, diffPercent: 40 }
        }
      }
    };

    const markdown = generatePrCommentMarkdown(mockSummary);

    // 1. Check title & duration
    expect(markdown).toContain('Vitix Performance Check: **FAILED**');
    expect(markdown).toContain('Total duration: 15.30s');
    
    // 2. Check Routes table
    expect(markdown).toContain('| Route | Preset | Performance | Accessibility | Best Practices | SEO | Status |');
    expect(markdown).toContain('| `/` | `mobile` | **80** | 90 | 95 | 100 | 🔴 |');

    // 3. Check violations
    expect(markdown).toContain('### ⚠️ Violations & Bottlenecks');
    expect(markdown).toContain('Category "performance" score of 80 is below threshold of 90.');
    expect(markdown).toContain('Metric "LCP" value of 2800ms exceeds maximum threshold of 2500ms.');

    // 4. Check baseline diff table
    expect(markdown).toContain('### 📈 Performance Changes (vs. Baseline)');
    expect(markdown).toContain('| `/ [mobile]` | PERFORMANCE | 90 | 80 | -10 (-11%) | Regressed ⚠️ |');
    expect(markdown).toContain('| `/ [mobile]` | LCP | 2000ms | 2800ms | +800ms (+40%) | Regressed ⚠️ |');
  });
});
