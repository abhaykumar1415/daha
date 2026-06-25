import path from 'node:path';
import fs from 'fs-extra';
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import { findFreePort } from '../utils/server.js';
import { LighthouseError } from '../utils/errors.js';
import { ParsedVitixConfig, AuditResult, LighthouseCategory, CoreWebVitalKey } from '../types/config.js';
import chalk from 'chalk';

// Safely handle ESM default export wrapper for Lighthouse
const runLighthouse = (lighthouse as any).default || lighthouse;

export interface LighthouseRunOptions {
  url: string;
  route: string;
  preset: 'mobile' | 'desktop';
  runIndex: number;
  outputDir: string;
}

/**
 * Runs a single Lighthouse audit on a URL.
 */
export async function runSingleAudit(
  config: ParsedVitixConfig,
  options: LighthouseRunOptions,
  verbose = false
): Promise<AuditResult> {
  const { url, route, preset, runIndex, outputDir } = options;
  const chromePort = await findFreePort(9222);

  // Combine Chrome flags
  const chromeFlags = [
    `--remote-debugging-port=${chromePort}`,
    ...(config.options?.chromeFlags || []),
  ];

  if (verbose) {
    console.log(chalk.dim(`[Run ${runIndex}] Launching Chrome for ${route} (${preset}) on port ${chromePort}...`));
  }

  // 1. Launch Browser using Playwright
  const browser = await chromium.launch({
    headless: true,
    args: chromeFlags,
  });

  let playwrightBrowser;
  try {
    // Connect Playwright to the same browser instance via CDP
    playwrightBrowser = await chromium.connectOverCDP(`http://localhost:${chromePort}`);
    const context = playwrightBrowser.contexts()[0];

    // Create a page to navigate/authenticate
    const page = await context.newPage();

    // Execute custom setup script if configured
    if (config.options?.setupScript) {
      const scriptPath = path.resolve(config.options.setupScript);
      if (await fs.pathExists(scriptPath)) {
        let setupFn: any;
        const ext = path.extname(scriptPath).toLowerCase();
        
        if (ext === '.ts') {
          const { loadTsFile } = await import('../config/loader.js');
          setupFn = await loadTsFile(scriptPath);
        } else {
          const moduleUrl = `file://${scriptPath.replace(/\\/g, '/')}`;
          const imported = await import(moduleUrl);
          setupFn = imported.default || imported;
        }

        if (typeof setupFn === 'function') {
          if (verbose) {
            console.log(chalk.dim(`[Run ${runIndex}] Executing Playwright setup script: ${config.options.setupScript}...`));
          }
          await setupFn({ page, context, url, route });
        } else {
          throw new LighthouseError(`Setup script at ${scriptPath} does not export a default function.`);
        }
      } else {
        throw new LighthouseError(`Setup script not found at path: ${scriptPath}`);
      }
    }
  } catch (error: any) {
    try {
      if (playwrightBrowser) await playwrightBrowser.close();
      await browser.close();
    } catch {
      // Ignore cleanup error
    }
    throw new LighthouseError(`Failed to establish CDP connection or execute setup script: ${error.message}`);
  }

  try {
    // 2. Set up Lighthouse flags and config
    const flags: any = {
      port: chromePort,
      output: 'html',
      logLevel: 'silent',
      disableStorageReset: false,
    };

    if (preset === 'desktop') {
      flags.preset = 'desktop';
    }

    // Pass CPU/network throttling if defined in config
    if (config.options?.throttling) {
      flags.throttling = config.options.throttling;
    }

    // 3. Execute Lighthouse
    if (verbose) {
      console.log(chalk.dim(`[Run ${runIndex}] Running Lighthouse audit on ${url}...`));
    }
    
    const runnerResult = await runLighthouse(url, flags);

    if (!runnerResult || !runnerResult.lhr) {
      throw new LighthouseError(`Lighthouse run failed to return results for ${url}`);
    }

    const { lhr, report } = runnerResult;

    // 4. Save HTML report
    const sanitizedRoute = route.replace(/[^a-zA-Z0-9]/g, '_') || 'root';
    const reportFilename = `report_${sanitizedRoute}_${preset}_run${runIndex}.html`;
    const reportsDir = path.join(outputDir, 'reports');
    await fs.ensureDir(reportsDir);
    const reportPath = path.join(reportsDir, reportFilename);
    
    if (report && typeof report === 'string') {
      await fs.writeFile(reportPath, report, 'utf8');
    } else if (report && Array.isArray(report)) {
      await fs.writeFile(reportPath, report[0], 'utf8');
    }

    // 5. Parse Category Scores
    const scores: Record<LighthouseCategory, number> = {
      performance: Math.round((lhr.categories.performance?.score || 0) * 100),
      accessibility: Math.round((lhr.categories.accessibility?.score || 0) * 100),
      'best-practices': Math.round((lhr.categories['best-practices']?.score || 0) * 100),
      seo: Math.round((lhr.categories.seo?.score || 0) * 100),
    };

    // 6. Parse Core Web Vitals Metrics
    const metrics: Record<CoreWebVitalKey, number> = {
      FCP: lhr.audits['first-contentful-paint']?.numericValue ?? 0,
      LCP: lhr.audits['largest-contentful-paint']?.numericValue ?? 0,
      CLS: lhr.audits['cumulative-layout-shift']?.numericValue ?? 0,
      FID: lhr.audits['max-potential-fid']?.numericValue ?? 0, // Fallback / max proxy for historical FID
      INP: lhr.audits['interaction-to-next-paint']?.numericValue ?? 0,
      TBT: lhr.audits['total-blocking-time']?.numericValue ?? 0,
      TTFB: lhr.audits['server-response-time']?.numericValue ?? 0,
    };

    // 6.7 Parse Resource transfer sizes and request counts
    const resourceItems = lhr.audits['resource-summary']?.details?.items || [];
    let totalJsSizeKb = 0;
    let totalCssSizeKb = 0;
    let totalImageSizeKb = 0;
    let thirdPartyRequests = 0;

    for (const item of resourceItems) {
      const sizeKb = Math.round(((item.transferSize || 0) / 1024) * 100) / 100;
      if (item.resourceType === 'script') {
        totalJsSizeKb = sizeKb;
      } else if (item.resourceType === 'stylesheet') {
        totalCssSizeKb = sizeKb;
      } else if (item.resourceType === 'image') {
        totalImageSizeKb = sizeKb;
      } else if (item.resourceType === 'third-party') {
        thirdPartyRequests = item.requestCount || 0;
      }
    }

    const relativeReportPath = path.relative(outputDir, reportPath);

    return {
      url,
      route,
      timestamp: new Date().toISOString(),
      preset,
      scores,
      metrics,
      lighthouseReportPath: relativeReportPath,
      runIndex,
      resources: {
        totalJsSizeKb,
        totalCssSizeKb,
        totalImageSizeKb,
        thirdPartyRequests,
      },
    };
  } catch (error: any) {
    throw new LighthouseError(`Lighthouse execution failed: ${error.message}`);
  } finally {
    // 7. Cleanup processes and browser contexts
    try {
      if (playwrightBrowser) await playwrightBrowser.close();
      await browser.close();
    } catch {
      // Ignore cleanup failures
    }
  }
}
