import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { analyzeRouteRuns } from '../analyzer/index.js';
import { printTerminalReport } from '../reporter/index.js';
import { DahaRunSummary, RouteAuditSummary } from '../types/config.js';

export interface CheckCommandOptions {
  config?: string;
  summary?: string;
}

/**
 * Checks a pre-existing audit summary file against config thresholds.
 */
export async function handleCheckCommand(options: CheckCommandOptions): Promise<void> {
  try {
    const config = await loadConfig(options.config);
    
    // Find summary JSON path
    const defaultSummaryPath = path.join(process.cwd(), config.output?.dir || '.daha', 'summary.json');
    const summaryPath = options.summary ? path.resolve(options.summary) : defaultSummaryPath;

    if (!await fs.pathExists(summaryPath)) {
      console.error(chalk.red(`\nError: Pre-existing summary file not found at ${summaryPath}`));
      console.log(chalk.gray('Please run `daha audit` first to generate a summary report.\n'));
      process.exit(1);
    }

    console.log(chalk.dim(`Reading audit summary from: ${summaryPath}`));
    const rawSummary: DahaRunSummary = await fs.readJson(summaryPath);
    
    // Re-analyze all routes in the summary file using current config thresholds
    const reAnalyzedRoutes: RouteAuditSummary[] = [];
    let allPassed = true;

    for (const routeSummary of rawSummary.routes) {
      const updatedRouteSummary = analyzeRouteRuns(
        routeSummary.route,
        routeSummary.url,
        routeSummary.runs,
        config
      );
      
      if (!updatedRouteSummary.passed) {
        allPassed = false;
      }
      reAnalyzedRoutes.push(updatedRouteSummary);
    }

    const updatedSummary: DahaRunSummary = {
      timestamp: rawSummary.timestamp,
      durationMs: rawSummary.durationMs,
      routes: reAnalyzedRoutes,
      passed: allPassed,
      baselineDiffs: rawSummary.baselineDiffs,
    };

    // Print terminal report
    printTerminalReport(updatedSummary);

    if (!updatedSummary.passed) {
      process.exit(1);
    }
  } catch (error: any) {
    console.error(chalk.red(`\nError: ${error.message}\n`));
    process.exit(1);
  }
}
