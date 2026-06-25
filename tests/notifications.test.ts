import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dispatchWebhook } from '../src/utils/notifications.js';
import { DahaRunSummary, ParsedDahaConfig } from '../src/types/config.js';

describe('Notifications Webhook', () => {
  let fetchMock: any;

  const mockSummaryPassed: DahaRunSummary = {
    timestamp: '2026-06-25T14:00:00.000Z',
    durationMs: 10000,
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
  };

  const mockSummaryFailed: DahaRunSummary = {
    timestamp: '2026-06-25T14:00:00.000Z',
    durationMs: 12000,
    passed: false,
    routes: [
      {
        route: '/',
        url: 'http://localhost:3000/',
        preset: 'mobile',
        passed: false,
        violations: ['Performance score of 80 is below threshold of 90.'],
        averageScores: { performance: 80, accessibility: 90, 'best-practices': 90, seo: 95 },
        averageMetrics: { FCP: 1500, LCP: 2600, CLS: 0.08, FID: 0, INP: 0, TBT: 100, TTFB: 0 },
        runs: [],
        medianRun: {
          url: 'http://localhost:3000/',
          route: '/',
          timestamp: '2026-06-25T14:00:00.000Z',
          preset: 'mobile',
          runIndex: 1,
          scores: { performance: 80, accessibility: 90, 'best-practices': 90, seo: 95 },
          metrics: { FCP: 1500, LCP: 2600, CLS: 0.08, FID: 0, INP: 0, TBT: 100, TTFB: 0 },
          lighthouseReportPath: ''
        }
      }
    ]
  };

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(() => Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({}),
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not dispatch if no webhookUrl is configured', async () => {
    const config: ParsedDahaConfig = {
      routes: 'auto',
      thresholds: {},
      options: { numberOfRuns: 3, preset: 'mobile', concurrency: 1, timeoutMs: 60000, chromeFlags: [] },
      build: { command: 'npm run build', dir: '.next' },
      server: { command: 'npm run start' },
      output: { dir: '.daha', formats: ['html', 'json', 'junit'], openReport: false },
      ci: { strict: true, junit: true },
      notifications: { webhookUrl: undefined, onFailureOnly: true },
      rum: {}
    };

    await dispatchWebhook(mockSummaryFailed, config);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should respect onFailureOnly settings', async () => {
    const config: ParsedDahaConfig = {
      routes: 'auto',
      thresholds: {},
      options: { numberOfRuns: 3, preset: 'mobile', concurrency: 1, timeoutMs: 60000, chromeFlags: [] },
      build: { command: 'npm run build', dir: '.next' },
      server: { command: 'npm run start' },
      output: { dir: '.daha', formats: ['html', 'json', 'junit'], openReport: false },
      ci: { strict: true, junit: true },
      notifications: { webhookUrl: 'https://example.com/webhook', onFailureOnly: true },
      rum: {}
    };

    // 1. onFailureOnly = true, and audit passed -> should not fetch
    await dispatchWebhook(mockSummaryPassed, config);
    expect(fetchMock).not.toHaveBeenCalled();

    // 2. onFailureOnly = true, and audit failed -> should fetch
    await dispatchWebhook(mockSummaryFailed, config);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 3. onFailureOnly = false, and audit passed -> should fetch
    fetchMock.mockClear();
    config.notifications.onFailureOnly = false;
    await dispatchWebhook(mockSummaryPassed, config);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should send correctly formatted Slack blocks payload', async () => {
    const config: ParsedDahaConfig = {
      routes: 'auto',
      thresholds: {},
      options: { numberOfRuns: 3, preset: 'mobile', concurrency: 1, timeoutMs: 60000, chromeFlags: [] },
      build: { command: 'npm run build', dir: '.next' },
      server: { command: 'npm run start' },
      output: { dir: '.daha', formats: ['html', 'json', 'junit'], openReport: false },
      ci: { strict: true, junit: true },
      notifications: { webhookUrl: 'https://hooks.slack.com/services/mock-slack-webhook-url', onFailureOnly: false },
      rum: {}
    };

    await dispatchWebhook(mockSummaryFailed, config);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestOptions] = fetchMock.mock.calls[0];
    expect(url).toContain('hooks.slack.com');
    expect(requestOptions.method).toBe('POST');
    expect(requestOptions.headers).toEqual({ 'Content-Type': 'application/json' });
    
    const body = JSON.parse(requestOptions.body);
    expect(body).toHaveProperty('blocks');
    expect(body.blocks[0].text.text).toContain('Daha Performance Check: FAILED');
    expect(body.blocks[2].text.text).toContain('Performance: *80*');
  });

  it('should send correctly formatted Discord embeds payload', async () => {
    const config: ParsedDahaConfig = {
      routes: 'auto',
      thresholds: {},
      options: { numberOfRuns: 3, preset: 'mobile', concurrency: 1, timeoutMs: 60000, chromeFlags: [] },
      build: { command: 'npm run build', dir: '.next' },
      server: { command: 'npm run start' },
      output: { dir: '.daha', formats: ['html', 'json', 'junit'], openReport: false },
      ci: { strict: true, junit: true },
      notifications: { webhookUrl: 'https://discord.com/api/webhooks/1234567890/abcde', onFailureOnly: false },
      rum: {}
    };

    await dispatchWebhook(mockSummaryPassed, config);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestOptions] = fetchMock.mock.calls[0];
    expect(url).toContain('discord.com');
    
    const body = JSON.parse(requestOptions.body);
    expect(body).toHaveProperty('embeds');
    expect(body.embeds[0].title).toContain('Daha Performance Check: PASSED');
    expect(body.embeds[0].color).toBe(0x10b981); // Green color code
    expect(body.embeds[0].fields[0].value).toContain('Performance: **95**');
  });

  it('should send correctly formatted Generic JSON payload', async () => {
    const config: ParsedDahaConfig = {
      routes: 'auto',
      thresholds: {},
      options: { numberOfRuns: 3, preset: 'mobile', concurrency: 1, timeoutMs: 60000, chromeFlags: [] },
      build: { command: 'npm run build', dir: '.next' },
      server: { command: 'npm run start' },
      output: { dir: '.daha', formats: ['html', 'json', 'junit'], openReport: false },
      ci: { strict: true, junit: true },
      notifications: { webhookUrl: 'https://example.com/custom-webhook', onFailureOnly: false },
      rum: {}
    };

    await dispatchWebhook(mockSummaryFailed, config);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.passed).toBe(false);
    expect(body.routesCount).toBe(1);
    expect(body.durationMs).toBe(12000);
    expect(body.avgScores.performance).toBe(80);
  });
});
