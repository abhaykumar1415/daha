import { z } from 'zod';

export const CoreWebVitalKeySchema = z.enum([
  'FCP',  // First Contentful Paint
  'LCP',  // Largest Contentful Paint
  'CLS',  // Cumulative Layout Shift
  'FID',  // First Input Delay
  'INP',  // Interaction to Next Paint
  'TBT',  // Total Blocking Time
  'TTFB', // Time to First Byte
]);

export type CoreWebVitalKey = z.infer<typeof CoreWebVitalKeySchema>;

export const LighthouseCategorySchema = z.enum([
  'performance',
  'accessibility',
  'best-practices',
  'seo',
]);

export type LighthouseCategory = z.infer<typeof LighthouseCategorySchema>;

export const ThrottlingSettingsSchema = z.object({
  rttMs: z.number().optional(),
  throughputKbps: z.number().optional(),
  requestLatencyMs: z.number().optional(),
  downloadThroughputKbps: z.number().optional(),
  uploadThroughputKbps: z.number().optional(),
  cpuSlowdownMultiplier: z.number().optional(),
});

export type LighthouseThrottlingSettings = z.infer<typeof ThrottlingSettingsSchema>;

export const MetricThresholdSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
});

export type MetricThreshold = z.infer<typeof MetricThresholdSchema>;

export const DahaConfigSchema = z.object({
  routes: z.union([z.array(z.string()), z.literal('auto')]).default('auto'),
  dynamicRouteParams: z.record(z.array(z.any())).optional(),
  thresholds: z.object({
    categories: z.record(LighthouseCategorySchema, z.number()).optional(),
    metrics: z.record(CoreWebVitalKeySchema, MetricThresholdSchema).optional(),
    overallScore: z.number().min(0).max(100).optional(),
    budgets: z.object({
      maxTotalJsSizeKb: z.number().optional(),
      maxTotalCssSizeKb: z.number().optional(),
      maxTotalImageSizeKb: z.number().optional(),
      maxThirdPartyRequests: z.number().optional(),
    }).optional(),
  }).default({}),
  options: z.object({
    numberOfRuns: z.number().int().min(1).default(3),
    preset: z.enum(['mobile', 'desktop', 'both']).default('mobile'),
    concurrency: z.number().int().min(1).default(1),
    timeoutMs: z.number().int().min(1000).default(60000),
    throttling: ThrottlingSettingsSchema.optional(),
    setupScript: z.string().optional(),
    framework: z.enum(['next', 'remix', 'astro', 'sveltekit', 'auto']).default('auto'),
    chromeFlags: z.array(z.string()).default([
      '--headless',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]),
  }).default({}),
  build: z.object({
    command: z.string().default('npm run build'),
    dir: z.string().default('.next'),
  }).default({}),
  server: z.object({
    command: z.string().default('npm run start'),
    port: z.number().int().min(1024).max(65535).optional(),
    url: z.string().url().optional(), // Used in --dev mode or pre-existing server
  }).default({}),
  output: z.object({
    dir: z.string().default('.daha'),
    formats: z.array(z.enum(['html', 'json', 'csv', 'junit'])).default(['html', 'json', 'junit']),
    openReport: z.boolean().default(false),
  }).default({}),
  baseline: z.object({
    enabled: z.boolean().default(false),
    dir: z.string().default('.daha/baseline'),
  }).optional(),
  ci: z.object({
    strict: z.boolean().default(true),
    junit: z.boolean().default(true),
    maxPerformanceRegressionPercent: z.number().optional(),
    maxMetricRegressionPercent: z.record(CoreWebVitalKeySchema, z.number()).optional(),
  }).default({}),
  notifications: z.object({
    webhookUrl: z.string().url().optional(),
    onFailureOnly: z.boolean().default(true),
  }).default({}),
  rum: z.object({
    cruxApiKey: z.string().optional(),
    origin: z.string().optional(),
  }).default({}),
});

export type DahaConfig = z.input<typeof DahaConfigSchema>;
export type ParsedDahaConfig = z.output<typeof DahaConfigSchema>;

export interface AuditResult {
  url: string;
  route: string;
  timestamp: string;
  preset: 'mobile' | 'desktop';
  scores: Record<LighthouseCategory, number>;
  metrics: Record<CoreWebVitalKey, number>;
  lighthouseReportPath: string; // path to the raw html report
  runIndex: number;
  resources?: {
    totalJsSizeKb: number;
    totalCssSizeKb: number;
    totalImageSizeKb: number;
    thirdPartyRequests: number;
  };
}

export interface RouteAuditSummary {
  route: string;
  url: string;
  preset: 'mobile' | 'desktop';
  runs: AuditResult[];
  medianRun: AuditResult;
  averageScores: Record<LighthouseCategory, number>;
  averageMetrics: Record<CoreWebVitalKey, number>;
  passed: boolean;
  violations: string[];
  rum?: {
    FCP: number;
    LCP: number;
    CLS: number;
    INP: number;
  };
}

export interface DahaRunSummary {
  timestamp: string;
  durationMs: number;
  routes: RouteAuditSummary[];
  passed: boolean;
  baselineDiffs?: Record<string, Record<string, { current: number; baseline: number; diff: number; diffPercent: number }>>;
}
