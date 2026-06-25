import { describe, it, expect } from 'vitest';
import { DahaConfigSchema } from '../src/types/config.js';

describe('Config Schema Validation', () => {
  it('should parse empty config and apply defaults', () => {
    const parsed = DahaConfigSchema.parse({});
    expect(parsed.routes).toBe('auto');
    expect(parsed.options.numberOfRuns).toBe(3);
    expect(parsed.options.preset).toBe('mobile');
    expect(parsed.options.concurrency).toBe(1);
    expect(parsed.build.command).toBe('npm run build');
    expect(parsed.build.dir).toBe('.next');
    expect(parsed.server.command).toBe('npm run start');
    expect(parsed.output.dir).toBe('.daha');
    expect(parsed.output.formats).toEqual(['html', 'json', 'junit']);
  });

  it('should validate and accept correct configurations', () => {
    const config = {
      routes: ['/', '/about', '/blog/[slug]'],
      dynamicRouteParams: {
        '/blog/[slug]': ['hello-world']
      },
      thresholds: {
        categories: {
          performance: 95,
          accessibility: 90
        },
        metrics: {
          LCP: { max: 2000 }
        }
      },
      options: {
        numberOfRuns: 5,
        preset: 'desktop' as const,
        concurrency: 2
      }
    };

    const parsed = DahaConfigSchema.parse(config);
    expect(parsed.routes).toEqual(['/', '/about', '/blog/[slug]']);
    expect(parsed.options.numberOfRuns).toBe(5);
    expect(parsed.options.preset).toBe('desktop');
    expect(parsed.options.concurrency).toBe(2);
    expect(parsed.thresholds.categories?.performance).toBe(95);
    expect(parsed.thresholds.metrics?.LCP.max).toBe(2000);
  });

  it('should throw error for invalid configurations', () => {
    const invalidConfig = {
      options: {
        preset: 'tablet', // Invalid preset
        concurrency: -1   // Concurrency cannot be negative
      }
    };

    const result = DahaConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errs = result.error.errors;
      expect(errs.some(e => e.path.join('.') === 'options.preset')).toBe(true);
      expect(errs.some(e => e.path.join('.') === 'options.concurrency')).toBe(true);
    }
  });
});
