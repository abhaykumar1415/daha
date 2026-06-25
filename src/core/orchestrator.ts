import path from 'node:path';
import fs from 'fs-extra';
import ora from 'ora';
import cliProgress from 'cli-progress';
import chalk from 'chalk';
import open from 'open';
import { ParsedDahaConfig, DahaRunSummary, RouteAuditSummary, AuditResult } from '../types/config.js';
import { discoverRoutes } from '../discovery/index.js';
import { buildProject, startServer, ServerInstance } from '../utils/server.js';
import { runSingleAudit } from '../lighthouse/index.js';
import { analyzeRouteRuns } from '../analyzer/index.js';
import { 
  printTerminalReport, 
  writeReports, 
  compareWithBaseline, 
  printBaselineComparison,
  updateHistoryCatalog
} from '../reporter/index.js';
import { DahaError } from '../utils/errors.js';
import { dispatchWebhook } from '../utils/notifications.js';

export interface AuditRunOptions {
  config: ParsedDahaConfig;
  devMode?: boolean;
  ciMode?: boolean;
  baselineMode?: boolean;
  presetOverride?: 'mobile' | 'desktop';
  routeOverride?: string;
  verbose?: boolean;
}

/**
 * Main orchestrator running the full Daha audit lifecycle.
 */
export async function runAudit(options: AuditRunOptions): Promise<DahaRunSummary> {
  const { config, devMode = false, ciMode = false, baselineMode = false, presetOverride, routeOverride, verbose = false } = options;
  const projectDir = process.cwd();
  const startTime = Date.now();

  let serverInstance: ServerInstance | null = null;
  const spinner = ora();

  // Handle Ctrl+C and exit hooks to shut down server
  const cleanup = async () => {
    if (serverInstance) {
      spinner.stop();
      const shutdownSpinner = ora('Stopping server...').start();
      await serverInstance.shutdown();
      shutdownSpinner.succeed('Server stopped.');
      serverInstance = null;
    }
  };

  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n\nAudit cancelled by user. Cleaning up...'));
    await cleanup();
    process.exit(130);
  });

  try {
    // 1. Production Build Phase (Skip in devMode or if server.url is custom)
    if (!devMode && !config.server?.url) {
      if (!ciMode) spinner.start('Compiling Next.js production build...');
      else console.log('Compiling Next.js production build...');

      await buildProject(config, projectDir, verbose);
      
      if (!ciMode) spinner.succeed('Next.js project compiled successfully.');
    }

    // 2. Start Production Server (Skip in devMode if custom URL exists)
    if (!ciMode) spinner.start('Launching local production server...');
    else console.log('Launching local production server...');

    // If devMode is active but config doesn't specify a server URL/port, fallback to default 3000
    if (devMode && !config.server?.url) {
      config.server.url = 'http://localhost:3000';
    }

    serverInstance = await startServer(config, projectDir, verbose);
    
    if (!ciMode) spinner.succeed(`Production server listening at ${serverInstance.url}`);

    // 3. Route Discovery Phase
    if (!ciMode) spinner.start('Discovering pages and routes...');
    else console.log('Discovering pages and routes...');

    // If routeOverride is specified via CLI, we audit ONLY that route
    if (routeOverride) {
      config.routes = [routeOverride];
    }

    const discoveryResult = await discoverRoutes(projectDir, config, {
      crawlerBaseUrl: serverInstance.url,
      useFsOnly: devMode, // In devMode we prioritize FS scan over manifests
    });

    if (!ciMode) {
      spinner.succeed(`Discovered ${discoveryResult.routes.length} route(s) from ${discoveryResult.source}`);
    } else {
      console.log(`Discovered ${discoveryResult.routes.length} route(s).`);
    }

    if (discoveryResult.routes.length === 0) {
      throw new DahaError('No routes were discovered to audit.', 'NO_ROUTES');
    }

    // Initialize timestamped run folder paths
    const baseOutputDir = path.join(projectDir, config.output?.dir || '.daha');
    const timestampStr = new Date().toISOString().replace(/[-T:]/g, '').split('.')[0]; // e.g. 20260625_133000
    const runId = `run_${timestampStr}`;
    const runOutputDir = path.join(baseOutputDir, 'runs', runId);

    // 4. Determine presets to run
    const activePresets: ('mobile' | 'desktop')[] = [];
    const configPreset = presetOverride || config.options?.preset || 'mobile';
    if (configPreset === 'mobile' || configPreset === 'both') activePresets.push('mobile');
    if (configPreset === 'desktop' || configPreset === 'both') activePresets.push('desktop');

    // Filter out dynamic routes that couldn't be interpolated (still have [ or ])
    const filteredRoutes = discoveryResult.routes.filter(r => {
      const isDynamic = r.includes('[') || r.includes(']');
      if (isDynamic) {
        console.log(chalk.yellow(`\n⚠️  Skipping dynamic route "${r}": no parameter values defined in config.`));
        return false;
      }
      return true;
    });

    if (filteredRoutes.length === 0) {
      throw new DahaError('No valid static or interpolated dynamic routes found for auditing.', 'NO_ROUTES');
    }

    // 5. Multi-run Lighthouse Audit Execution
    const totalAudits = filteredRoutes.length * activePresets.length * (config.options?.numberOfRuns || 3);
    let completedAudits = 0;

    console.log(chalk.bold.cyan(`\nStarting ${totalAudits} Lighthouse audits...`));

    // Setup Progress Bar (hide in CI)
    const progressBar = !ciMode
      ? new cliProgress.SingleBar({
          format: `${chalk.blue('Auditing')} |{bar}| {percentage}% | {value}/{total} runs completed | Current: {route} ({preset})`,
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true,
        }, cliProgress.Presets.rect)
      : null;

    if (progressBar) {
      progressBar.start(totalAudits, 0, { route: '', preset: '' });
    }

    const routeSummaries: RouteAuditSummary[] = [];

    // Implement concurrency limit (Worker Pool)
    const routesToAudit = [...filteredRoutes];
    const concurrency = config.options?.concurrency || 1;

    const worker = async () => {
      while (routesToAudit.length > 0) {
        const route = routesToAudit.shift()!;
        
        for (const preset of activePresets) {
          const runs: AuditResult[] = [];
          
          for (let runIdx = 1; runIdx <= (config.options?.numberOfRuns || 3); runIdx++) {
            if (progressBar) {
              progressBar.update(completedAudits, { route, preset });
            } else if (verbose) {
              console.log(`Auditing ${route} [${preset}] - Run ${runIdx}/${config.options?.numberOfRuns || 3}...`);
            }

            const url = `${serverInstance!.url}${route === '/' ? '' : route}`;
            const runResult = await runSingleAudit(config, {
              url,
              route,
              preset,
              runIndex: runIdx,
              outputDir: runOutputDir,
            }, verbose);

            runs.push(runResult);
            completedAudits++;
            
            if (progressBar) {
              progressBar.update(completedAudits);
            }
          }

          // Route Analysis (Median selection & threshold violations checking)
          const summary = analyzeRouteRuns(route, `${serverInstance!.url}${route === '/' ? '' : route}`, runs, config);

          // Fetch CrUX RUM Metrics if API Key is configured
          if (config.rum?.cruxApiKey) {
            let publicUrl = '';
            if (config.rum?.origin) {
              publicUrl = `${config.rum.origin}${route}`;
            } else if (serverInstance!.url && !serverInstance!.url.includes('localhost') && !serverInstance!.url.includes('127.0.0.1')) {
              publicUrl = `${serverInstance!.url}${route === '/' ? '' : route}`;
            }

            if (publicUrl) {
              try {
                const { fetchCruxMetrics } = await import('../rum/crux.js');
                const cruxData = await fetchCruxMetrics(publicUrl, config.rum.cruxApiKey, preset);
                if (cruxData) {
                  summary.rum = cruxData;
                }
              } catch {
                // Ignore crux fetch error
              }
            }
          }

          routeSummaries.push(summary);
        }
      }
    };

    // Run pool
    const workers = Array(concurrency).fill(null).map(() => worker());
    await Promise.all(workers);

    if (progressBar) {
      progressBar.stop();
    }

    // Shut down local server
    await cleanup();

    // 6. Assemble Run Summary
    let allPassed = true;
    for (const r of routeSummaries) {
      if (!r.passed) allPassed = false;
    }

    const summary: DahaRunSummary = {
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      routes: routeSummaries,
      passed: allPassed,
    };

    // 7. Baseline Comparison
    const baselineDir = config.baseline?.dir || '.daha/baseline';
    const isBaselineEnabled = config.baseline?.enabled || baselineMode;

    if (isBaselineEnabled) {
      const baselineDiffs = await compareWithBaseline(summary, path.join(projectDir, baselineDir), config);
      if (baselineDiffs) {
        summary.baselineDiffs = baselineDiffs;
      }
    }

    // 8. Write Output Reports (HTML, JSON, CSV, JUnit)
    await writeReports(summary, config, runOutputDir);

    // Update history catalog
    await updateHistoryCatalog(baseOutputDir, runId, summary);

    // Copy latest run files to latestDir
    const latestDir = path.join(baseOutputDir, 'latest');
    await fs.emptyDir(latestDir);
    await fs.copy(runOutputDir, latestDir);

    // 9. Handle Baseline Save
    // If command line specifies --baseline (baselineMode) or baseline.enabled, copy this run to baseline directory
    if (baselineMode || (config.baseline?.enabled && !fs.existsSync(path.join(projectDir, baselineDir, 'summary.json')))) {
      const targetBaselineDir = path.join(projectDir, baselineDir);
      await fs.ensureDir(targetBaselineDir);
      await fs.copy(runOutputDir, targetBaselineDir, {
        filter: (src) => {
          // Only copy JSON summary and report HTMLs to baseline
          return !src.endsWith('junit.xml') && !src.endsWith('summary.csv');
        }
      });
      console.log(chalk.green(`\n✓ Baseline saved to: ${targetBaselineDir}`));
    }

    // 10. Print Terminal Report
    printTerminalReport(summary);

    if (summary.baselineDiffs) {
      printBaselineComparison(summary.baselineDiffs);
    }

    // 11. Open Report HTML (if requested)
    if (config.output?.openReport && !ciMode) {
      const reportHtmlPath = path.join(latestDir, 'index.html');
      await open(reportHtmlPath);
    }

    // 12. Dispatch Webhooks
    await dispatchWebhook(summary, config);

    return summary;
  } catch (error: any) {
    await cleanup();
    throw error;
  }
}
