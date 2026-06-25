import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { table } from 'table';
import builder from 'junit-report-builder';
import { VitixRunSummary, ParsedVitixConfig, CoreWebVitalKey, LighthouseCategory } from '../types/config.js';

/**
 * Returns the classification (Good, Needs Improvement, Poor) and color code for Core Web Vitals.
 */
export function getMetricStatus(metric: CoreWebVitalKey, value: number): { status: 'good' | 'needs-improvement' | 'poor'; label: string; color: string } {
  switch (metric) {
    case 'LCP':
      if (value <= 2500) return { status: 'good', label: 'Good', color: '#10b981' };
      if (value <= 4000) return { status: 'needs-improvement', label: 'Needs Improvement', color: '#f59e0b' };
      return { status: 'poor', label: 'Poor', color: '#ef4444' };
    case 'CLS':
      if (value <= 0.1) return { status: 'good', label: 'Good', color: '#10b981' };
      if (value <= 0.25) return { status: 'needs-improvement', label: 'Needs Improvement', color: '#f59e0b' };
      return { status: 'poor', label: 'Poor', color: '#ef4444' };
    case 'INP':
      if (value <= 200) return { status: 'good', label: 'Good', color: '#10b981' };
      if (value <= 500) return { status: 'needs-improvement', label: 'Needs Improvement', color: '#f59e0b' };
      return { status: 'poor', label: 'Poor', color: '#ef4444' };
    case 'FCP':
      if (value <= 1800) return { status: 'good', label: 'Good', color: '#10b981' };
      if (value <= 3000) return { status: 'needs-improvement', label: 'Needs Improvement', color: '#f59e0b' };
      return { status: 'poor', label: 'Poor', color: '#ef4444' };
    case 'TBT':
      if (value <= 200) return { status: 'good', label: 'Good', color: '#10b981' };
      if (value <= 600) return { status: 'needs-improvement', label: 'Needs Improvement', color: '#f59e0b' };
      return { status: 'poor', label: 'Poor', color: '#ef4444' };
    case 'FID':
      if (value <= 100) return { status: 'good', label: 'Good', color: '#10b981' };
      if (value <= 300) return { status: 'needs-improvement', label: 'Needs Improvement', color: '#f59e0b' };
      return { status: 'poor', label: 'Poor', color: '#ef4444' };
    case 'TTFB':
      if (value <= 800) return { status: 'good', label: 'Good', color: '#10b981' };
      if (value <= 1800) return { status: 'needs-improvement', label: 'Needs Improvement', color: '#f59e0b' };
      return { status: 'poor', label: 'Poor', color: '#ef4444' };
    default:
      return { status: 'good', label: 'Unknown', color: '#6b7280' };
  }
}

/**
 * Returns color code for standard Lighthouse scores (0-100).
 */
export function getScoreColor(score: number): string {
  if (score >= 90) return '#10b981'; // Green
  if (score >= 50) return '#f59e0b'; // Orange
  return '#ef4444'; // Red
}

/**
 * Generates and prints the colorful terminal summary table.
 */
export function printTerminalReport(summary: VitixRunSummary): void {
  console.log('\n' + chalk.bold.cyan('=== Vitix Audit Results ===') + '\n');

  const headers = [
    chalk.bold('Route'),
    chalk.bold('Preset'),
    chalk.bold('Perf'),
    chalk.bold('A11y'),
    chalk.bold('Best P.'),
    chalk.bold('SEO'),
    chalk.bold('LCP'),
    chalk.bold('CLS'),
    chalk.bold('TBT'),
    chalk.bold('Status')
  ];

  const rows = [headers];

  for (const r of summary.routes) {
    const run = r.medianRun;
    
    // Formatting category scores
    const perfCol = formatTerminalScore(run.scores.performance);
    const a11yCol = formatTerminalScore(run.scores.accessibility);
    const bpCol = formatTerminalScore(run.scores['best-practices']);
    const seoCol = formatTerminalScore(run.scores.seo);

    // Formatting key metrics
    const lcpCol = formatTerminalMetric('LCP', run.metrics.LCP, `${Math.round(run.metrics.LCP)}ms`);
    const clsCol = formatTerminalMetric('CLS', run.metrics.CLS, run.metrics.CLS.toFixed(3));
    const tbtCol = formatTerminalMetric('TBT', run.metrics.TBT, `${Math.round(run.metrics.TBT)}ms`);

    const statusCol = r.passed 
      ? chalk.green.bold('PASSED ✓') 
      : chalk.red.bold('FAILED ✗');

    rows.push([
      chalk.white(r.route),
      chalk.gray(r.preset),
      perfCol,
      a11yCol,
      bpCol,
      seoCol,
      lcpCol,
      clsCol,
      tbtCol,
      statusCol
    ]);
  }

  console.log(table(rows));

  // Print violations if any
  const failedRoutes = summary.routes.filter(r => !r.passed);
  if (failedRoutes.length > 0) {
    console.log(chalk.red.bold('Violations Detected:'));
    for (const r of failedRoutes) {
      console.log(`\n  ${chalk.underline.red(r.route)} [${r.preset}]:`);
      for (const v of r.violations) {
        console.log(`    - ${v}`);
      }
    }
    console.log('\n' + chalk.red.bold(`Audit failed: ${failedRoutes.length} route(s) did not meet thresholds.`) + '\n');
  } else {
    console.log('\n' + chalk.green.bold('Audit passed: All routes met defined thresholds! 🎉') + '\n');
  }
}

function formatTerminalScore(score: number): string {
  if (score >= 90) return chalk.green(score);
  if (score >= 50) return chalk.yellow(score);
  return chalk.red(score);
}

function formatTerminalMetric(metric: CoreWebVitalKey, value: number, text: string): string {
  const meta = getMetricStatus(metric, value);
  if (meta.status === 'good') return chalk.green(text);
  if (meta.status === 'needs-improvement') return chalk.yellow(text);
  return chalk.red(text);
}

/**
 * Generates and saves JSON, CSV, JUnit, and HTML reports.
 */
export async function writeReports(
  summary: VitixRunSummary,
  config: ParsedVitixConfig,
  outputDir: string
): Promise<void> {
  await fs.ensureDir(outputDir);
  const formats = config.output?.formats || ['html', 'json', 'junit'];

  // 1. JSON Exporter
  if (formats.includes('json')) {
    const jsonPath = path.join(outputDir, 'summary.json');
    await fs.writeJson(jsonPath, summary, { spaces: 2 });
  }

  // 2. CSV Exporter
  if (formats.includes('csv')) {
    const csvPath = path.join(outputDir, 'summary.csv');
    let csvContent = 'route,preset,passed,performance,accessibility,best_practices,seo,FCP,LCP,CLS,FID,INP,TBT,TTFB\n';
    
    for (const r of summary.routes) {
      const run = r.medianRun;
      csvContent += `"${r.route}",${r.preset},${r.passed},${run.scores.performance},${run.scores.accessibility},${run.scores['best-practices']},${run.scores.seo},${run.metrics.FCP},${run.metrics.LCP},${run.metrics.CLS},${run.metrics.FID},${run.metrics.INP},${run.metrics.TBT},${run.metrics.TTFB}\n`;
    }
    await fs.writeFile(csvPath, csvContent, 'utf8');
  }

  // 3. JUnit XML Exporter
  if (formats.includes('junit')) {
    const junitPath = path.join(outputDir, 'junit.xml');
    const suite = builder.testSuite().name('Vitix Lighthouse Audits');
    
    for (const r of summary.routes) {
      const firstTime = r.runs.length > 0 ? new Date(r.runs[0].timestamp).getTime() : 0;
      const lastTime = r.runs.length > 0 ? new Date(r.runs[r.runs.length - 1].timestamp).getTime() : 0;
      const durationSeconds = firstTime && lastTime ? Math.max((lastTime - firstTime) / 1000 + 5, 5) : 5;

      const tc = suite.testCase()
        .name(`${r.route} [${r.preset}]`)
        .className('LighthouseAudits');
        
      (tc as any).time(durationSeconds);
        
      if (!r.passed) {
        // Group violations by type
        const thresholdViolations = r.violations.filter(v => v.includes('below threshold') || v.includes('exceeds maximum threshold') || v.includes('exceeds threshold'));
        const budgetViolations = r.violations.filter(v => v.includes('budget limit'));
        const regressionViolations = r.violations.filter(v => v.includes('regressed'));

        let failureMsg = '';
        if (thresholdViolations.length > 0) {
          failureMsg += `[Threshold Violations]\n${thresholdViolations.map(v => `  - ${v}`).join('\n')}\n`;
        }
        if (budgetViolations.length > 0) {
          failureMsg += `[Resource Budget Violations]\n${budgetViolations.map(v => `  - ${v}`).join('\n')}\n`;
        }
        if (regressionViolations.length > 0) {
          failureMsg += `[Regression Violations]\n${regressionViolations.map(v => `  - ${v}`).join('\n')}\n`;
        }
        
        // Fallback for other/ungrouped violations
        const otherViolations = r.violations.filter(v => 
          !thresholdViolations.includes(v) && 
          !budgetViolations.includes(v) && 
          !regressionViolations.includes(v)
        );
        if (otherViolations.length > 0) {
          failureMsg += `[Other Violations]\n${otherViolations.map(v => `  - ${v}`).join('\n')}\n`;
        }

        tc.failure(failureMsg.trim());
      }
    }
    
    builder.writeTo(junitPath);
  }

  // 4. HTML Dashboard Exporter
  if (formats.includes('html')) {
    const htmlPath = path.join(outputDir, 'index.html');
    const htmlContent = generateHtmlDashboard(summary);
    await fs.writeFile(htmlPath, htmlContent, 'utf8');
  }

  // 5. PR Comment Markdown Exporter (Always generated in the run output dir)
  const prCommentPath = path.join(outputDir, 'pr_comment.md');
  const prCommentContent = generatePrCommentMarkdown(summary);
  await fs.writeFile(prCommentPath, prCommentContent, 'utf8');
}

/**
 * Builds baseline diffs if baseline is enabled and exists.
 */
export async function compareWithBaseline(
  currentSummary: VitixRunSummary,
  baselineDir: string,
  config: ParsedVitixConfig
): Promise<VitixRunSummary['baselineDiffs'] | undefined> {
  const baselineJsonPath = path.join(baselineDir, 'summary.json');
  if (!await fs.pathExists(baselineJsonPath)) {
    return undefined;
  }

  try {
    const baselineSummary: VitixRunSummary = await fs.readJson(baselineJsonPath);
    const diffs: NonNullable<VitixRunSummary['baselineDiffs']> = {};

    for (const currentRoute of currentSummary.routes) {
      const baselineRoute = baselineSummary.routes.find(
        r => r.route === currentRoute.route && r.preset === currentRoute.preset
      );

      if (!baselineRoute) continue;

      const currentRun = currentRoute.medianRun;
      const baselineRun = baselineRoute.medianRun;
      const routeKey = `${currentRoute.route} [${currentRoute.preset}]`;
      diffs[routeKey] = {};

      // Compare Categories
      for (const cat of ['performance', 'accessibility', 'best-practices', 'seo'] as LighthouseCategory[]) {
        const currVal = currentRun.scores[cat];
        const baseVal = baselineRun.scores[cat];
        const diff = currVal - baseVal;
        const diffPercent = baseVal !== 0 ? Math.round((diff / baseVal) * 100) : 0;
        diffs[routeKey][`category:${cat}`] = { current: currVal, baseline: baseVal, diff, diffPercent };

        // Regression check for categories (Performance regression only)
        if (cat === 'performance' && config.ci?.maxPerformanceRegressionPercent !== undefined) {
          const maxDrop = config.ci.maxPerformanceRegressionPercent;
          if (diffPercent < 0 && Math.abs(diffPercent) > maxDrop) {
            currentRoute.violations.push(
              `Performance score regressed by ${Math.abs(diffPercent)}% (from ${baseVal} to ${currVal}), exceeding the regression limit of ${maxDrop}%.`
            );
            currentRoute.passed = false;
            currentSummary.passed = false;
          }
        }
      }

      // Compare Metrics
      for (const metric of ['LCP', 'CLS', 'TBT', 'FCP', 'INP', 'TTFB'] as CoreWebVitalKey[]) {
        const currVal = currentRun.metrics[metric];
        const baseVal = baselineRun.metrics[metric];
        const diff = currVal - baseVal;
        const diffPercent = baseVal !== 0 ? Math.round((diff / baseVal) * 100) : 0;
        diffs[routeKey][`metric:${metric}`] = { current: currVal, baseline: baseVal, diff, diffPercent };

        // Regression check for individual metrics
        if (config.ci?.maxMetricRegressionPercent) {
          const maxIncrease = config.ci.maxMetricRegressionPercent[metric];
          if (maxIncrease !== undefined && diffPercent > 0 && diffPercent > maxIncrease) {
            const unit = metric === 'CLS' ? '' : 'ms';
            const baseStr = `${baseVal.toFixed(metric === 'CLS' ? 3 : 0)}${unit}`;
            const currStr = `${currVal.toFixed(metric === 'CLS' ? 3 : 0)}${unit}`;
            currentRoute.violations.push(
              `Metric "${metric}" value regressed by ${diffPercent}% (from ${baseStr} to ${currStr}), exceeding the regression limit of ${maxIncrease}%.`
            );
            currentRoute.passed = false;
            currentSummary.passed = false;
          }
        }
      }
    }

    return diffs;
  } catch {
    return undefined; // Fail silently and ignore baseline diff
  }
}

/**
 * Outputs baseline comparisons to the console.
 */
export function printBaselineComparison(diffs: NonNullable<VitixRunSummary['baselineDiffs']>): void {
  console.log(chalk.bold.cyan('\n=== Baseline Performance Comparison ===\n'));

  for (const [route, routeDiffs] of Object.entries(diffs)) {
    console.log(chalk.bold.white(route));
    
    const rows = [[
      chalk.bold('Type'),
      chalk.bold('Key'),
      chalk.bold('Baseline'),
      chalk.bold('Current'),
      chalk.bold('Difference'),
      chalk.bold('Status')
    ]];

    for (const [key, item] of Object.entries(routeDiffs)) {
      const isCat = key.startsWith('category:');
      const name = key.split(':')[1];
      const typeLabel = isCat ? 'Score' : 'Metric';
      
      const unit = isCat || name === 'CLS' ? '' : 'ms';
      const baseStr = `${item.baseline.toFixed(name === 'CLS' ? 3 : 0)}${unit}`;
      const currStr = `${item.current.toFixed(name === 'CLS' ? 3 : 0)}${unit}`;
      
      // Determine if change is positive or negative
      // For score: positive difference is good. For metrics: negative difference (faster) is good.
      const isPositiveGood = isCat;
      const isImproved = isPositiveGood ? item.diff > 0 : item.diff < 0;
      const isRegressed = isPositiveGood ? item.diff < 0 : item.diff > 0;

      let diffStr = '';
      let statusStr = chalk.dim('No Change');

      if (item.diff !== 0) {
        const sign = item.diff > 0 ? '+' : '';
        const pctSign = item.diffPercent > 0 ? '+' : '';
        diffStr = `${sign}${item.diff.toFixed(name === 'CLS' ? 3 : 0)}${unit} (${pctSign}${item.diffPercent}%)`;
        
        if (isImproved) {
          statusStr = chalk.green('Improved 🚀');
          diffStr = chalk.green(diffStr);
        } else if (isRegressed) {
          statusStr = chalk.red('Regressed ⚠️');
          diffStr = chalk.red(diffStr);
        }
      }

      rows.push([
        chalk.gray(typeLabel),
        chalk.white(name.toUpperCase()),
        chalk.gray(baseStr),
        chalk.white(currStr),
        diffStr || chalk.gray('0'),
        statusStr
      ]);
    }

    console.log(table(rows));
  }
}

/**
 * Builds a modern dark-mode responsive glassmorphic HTML Dashboard template.
 */
function generateHtmlDashboard(summary: VitixRunSummary): string {
  const totalRoutes = summary.routes.length;
  const passedRoutes = summary.routes.filter(r => r.passed).length;
  const failedRoutes = totalRoutes - passedRoutes;
  const timestamp = new Date(summary.timestamp).toLocaleString();
  const duration = (summary.durationMs / 1000).toFixed(1);

  // Generate Route Details Card HTML
  const routesHtml = summary.routes.map((r, i) => {
    const run = r.medianRun;
    const passedClass = r.passed ? 'status-passed' : 'status-failed';
    const statusText = r.passed ? 'PASSED' : 'FAILED';
    
    // Violations list
    const violationsList = r.violations.length > 0
      ? `<div class="violations-box">
          <h4>Threshold Violations</h4>
          <ul>
            ${r.violations.map(v => `<li>${v}</li>`).join('')}
          </ul>
         </div>`
      : '';

    // Core Web Vitals status calculations
    const metricsKeys: CoreWebVitalKey[] = ['LCP', 'CLS', 'TBT', 'FCP', 'INP', 'TTFB'];
    const metricsHtml = metricsKeys.map(k => {
      const val = run.metrics[k];
      const meta = getMetricStatus(k, val);
      const valStr = k === 'CLS' ? val.toFixed(3) : `${Math.round(val)}ms`;
      return `
        <div class="metric-card">
          <div class="metric-header">
            <span class="metric-name">${k}</span>
            <span class="metric-badge" style="background-color: ${meta.color}22; color: ${meta.color}">${meta.label}</span>
          </div>
          <div class="metric-value">${valStr}</div>
        </div>
      `;
    }).join('');

    // Category Score cards
    const categories: { key: LighthouseCategory; label: string }[] = [
      { key: 'performance', label: 'Performance' },
      { key: 'accessibility', label: 'Accessibility' },
      { key: 'best-practices', label: 'Best Practices' },
      { key: 'seo', label: 'SEO' }
    ];
    
    const categoriesHtml = categories.map(c => {
      const score = run.scores[c.key];
      const color = getScoreColor(score);
      return `
        <div class="score-circle-container">
          <svg class="score-svg" viewBox="0 0 36 36">
            <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            <path class="circle" stroke="${color}" stroke-dasharray="${score}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
          </svg>
          <div class="score-percentage" style="color: ${color}">${score}</div>
          <div class="score-label">${c.label}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="route-item" id="route-${i}" style="display: ${i === 0 ? 'block' : 'none'}">
        <div class="route-info-header">
          <div>
            <h2>Route: <code class="route-code">${r.route}</code></h2>
            <p class="route-url"><a href="${r.url}" target="_blank">${r.url}</a></p>
          </div>
          <div class="route-meta-right">
            <span class="preset-badge">${r.preset.toUpperCase()}</span>
            <span class="route-status-pill ${passedClass}">${statusText}</span>
          </div>
        </div>

        <div class="category-scores-row">
          ${categoriesHtml}
        </div>

        ${violationsList}

        <h3 class="section-title">Core Web Vitals & Audits (Median Run)</h3>
        <div class="metrics-grid">
          ${metricsHtml}
        </div>

        ${(() => {
          if (!r.rum) return '';
          const crux = r.rum;
          const metricsToCheck: { key: string; label: string; unit: string }[] = [
            { key: 'LCP', label: 'LCP', unit: 'ms' },
            { key: 'CLS', label: 'CLS', unit: '' },
            { key: 'FCP', label: 'FCP', unit: 'ms' },
            { key: 'INP', label: 'INP', unit: 'ms' },
          ];

          const rowsHtml = metricsToCheck.map(m => {
            const labVal = run.metrics[m.key as CoreWebVitalKey] ?? 0;
            const cruxVal = (crux as any)[m.key] ?? 0;
            const diff = labVal - cruxVal;
            const sign = diff > 0 ? '+' : '';
            const diffStr = cruxVal > 0 ? `${sign}${diff.toFixed(m.key === 'CLS' ? 3 : 0)}${m.unit}` : 'N/A';
            const labStr = `${labVal.toFixed(m.key === 'CLS' ? 3 : 0)}${m.unit}`;
            const cruxStr = cruxVal > 0 ? `${cruxVal.toFixed(m.key === 'CLS' ? 3 : 0)}${m.unit}` : 'N/A';
            
            return `
              <tr>
                <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color); font-weight: 600;">${m.label}</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${labStr}</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${cruxStr}</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color); font-weight: 600; color: ${diff > 0 ? '#ef4444' : '#10b981'};">${diffStr}</td>
              </tr>
            `;
          }).join('');

          return `
            <h3 class="section-title" style="margin-top: 2rem;">Real-User Experience Comparison (Google CrUX API)</h3>
            <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.25rem;">
              <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                  <tr>
                    <th style="padding: 0.75rem; border-bottom: 2px solid var(--border-color); color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">Metric</th>
                    <th style="padding: 0.75rem; border-bottom: 2px solid var(--border-color); color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">Lighthouse (Lab)</th>
                    <th style="padding: 0.75rem; border-bottom: 2px solid var(--border-color); color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">CrUX API (Field)</th>
                    <th style="padding: 0.75rem; border-bottom: 2px solid var(--border-color); color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>
          `;
        })()}

        <div class="route-actions">
          <a href="${run.lighthouseReportPath}" target="_blank" class="btn btn-primary">Open Detailed Lighthouse Report</a>
        </div>
      </div>
    `;
  }).join('');

  // Sidebar route selectors
  const sidebarHtml = summary.routes.map((r, i) => {
    const activeClass = i === 0 ? 'active' : '';
    const statusDot = r.passed ? 'dot-passed' : 'dot-failed';
    return `
      <button class="sidebar-item ${activeClass}" onclick="showRoute(${i})" id="sidebar-btn-${i}">
        <span class="status-dot ${statusDot}"></span>
        <div class="sidebar-item-text">
          <span class="sidebar-route-path">${r.route}</span>
          <span class="sidebar-route-preset">${r.preset}</span>
        </div>
      </button>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vitix - Web Vitals CLI Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0b0f19;
      --card-bg: rgba(22, 28, 45, 0.4);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --passed-color: #10b981;
      --failed-color: #ef4444;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Outfit', sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background-image: radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.08) 0%, transparent 40%),
                        radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.05) 0%, transparent 40%);
    }

    header {
      border-bottom: 1px solid var(--border-color);
      backdrop-filter: blur(12px);
      background-color: rgba(11, 15, 25, 0.8);
      padding: 1.5rem 2rem;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .header-container {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo-icon {
      font-size: 2rem;
      font-weight: 700;
      color: var(--primary);
      background: linear-gradient(135deg, var(--primary), #10b981);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .logo-text {
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: 1px;
    }

    .logo-tagline {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-left: 0.5rem;
      border-left: 1px solid var(--border-color);
      padding-left: 0.5rem;
    }

    .meta-time {
      font-size: 0.9rem;
      color: var(--text-muted);
    }

    main {
      flex: 1;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
      padding: 2rem;
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 2rem;
    }

    @media (max-width: 1024px) {
      main {
        grid-template-columns: 1fr;
      }
    }

    /* Summary Section */
    .summary-widgets {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
      margin-bottom: 1rem;
    }

    .widget {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 1.5rem;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
    }

    .widget-title {
      font-size: 0.9rem;
      color: var(--text-muted);
      font-weight: 400;
      margin-bottom: 0.5rem;
    }

    .widget-value {
      font-size: 2rem;
      font-weight: 700;
    }

    .passed-text { color: var(--passed-color); }
    .failed-text { color: var(--failed-color); }

    /* Sidebar Layout */
    .sidebar {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      padding: 1rem;
      backdrop-filter: blur(8px);
      max-height: 70vh;
      overflow-y: auto;
    }

    .sidebar-title {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      padding: 0.5rem 0.75rem;
      margin-bottom: 0.5rem;
      font-weight: 600;
    }

    .sidebar-item {
      width: 100%;
      background: transparent;
      border: none;
      border-radius: 12px;
      padding: 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      text-align: left;
      cursor: pointer;
      color: var(--text-main);
      transition: all 0.2s ease;
      margin-bottom: 0.5rem;
    }

    .sidebar-item:hover {
      background: rgba(255, 255, 255, 0.04);
    }

    .sidebar-item.active {
      background: rgba(59, 130, 246, 0.15);
      border-left: 3px solid var(--primary);
    }

    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .dot-passed { background-color: var(--passed-color); box-shadow: 0 0 8px var(--passed-color); }
    .dot-failed { background-color: var(--failed-color); box-shadow: 0 0 8px var(--failed-color); }

    .sidebar-item-text {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-route-path {
      font-weight: 600;
      font-size: 0.95rem;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }

    .sidebar-route-preset {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    /* Content Area */
    .content-area {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 20px;
      padding: 2rem;
      backdrop-filter: blur(8px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    .route-info-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border-color);
      flex-wrap: wrap;
      gap: 1rem;
    }

    .route-code {
      font-family: monospace;
      background: rgba(255, 255, 255, 0.06);
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      color: #38bdf8;
    }

    .route-url {
      font-size: 0.9rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    .route-url a {
      color: var(--text-muted);
      text-decoration: none;
    }

    .route-url a:hover {
      color: var(--primary);
      text-decoration: underline;
    }

    .route-meta-right {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .preset-badge {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-muted);
    }

    .route-status-pill {
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .status-passed { background-color: rgba(16, 185, 129, 0.15); color: var(--passed-color); border: 1px solid var(--passed-color); }
    .status-failed { background-color: rgba(239, 68, 68, 0.15); color: var(--failed-color); border: 1px solid var(--failed-color); }

    /* Category Scores Gauges */
    .category-scores-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2.5rem;
    }

    .score-circle-container {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }

    .score-svg {
      width: 100px;
      height: 100px;
    }

    .circle-bg {
      fill: none;
      stroke: rgba(255, 255, 255, 0.05);
      stroke-width: 2.8;
    }

    .circle {
      fill: none;
      stroke-width: 2.8;
      stroke-linecap: round;
      transform: rotate(-90deg);
      transform-origin: 50% 50%;
      transition: stroke-dasharray 0.3s ease;
    }

    .score-percentage {
      position: absolute;
      top: 50px;
      font-size: 1.5rem;
      font-weight: 700;
    }

    .score-label {
      font-size: 0.95rem;
      font-weight: 600;
      margin-top: 1rem;
      color: var(--text-main);
    }

    /* Violations box */
    .violations-box {
      background-color: rgba(239, 68, 68, 0.05);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 12px;
      padding: 1.25rem;
      margin-bottom: 2rem;
    }

    .violations-box h4 {
      color: var(--failed-color);
      font-size: 1rem;
      margin-bottom: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .violations-box ul {
      list-style-type: none;
      padding-left: 0.5rem;
    }

    .violations-box li {
      margin-bottom: 0.5rem;
      font-size: 0.9rem;
      color: #fca5a5;
      position: relative;
      padding-left: 1.25rem;
    }

    .violations-box li::before {
      content: "•";
      color: var(--failed-color);
      position: absolute;
      left: 0;
      font-weight: bold;
    }

    /* Metrics Grid */
    .section-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 1.25rem;
      border-left: 3px solid var(--primary);
      padding-left: 0.5rem;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2.5rem;
    }

    .metric-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 1.25rem;
    }

    .metric-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .metric-name {
      font-weight: 600;
      font-size: 0.95rem;
      color: var(--text-muted);
    }

    .metric-badge {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
    }

    .metric-value {
      font-size: 1.6rem;
      font-weight: 700;
      color: var(--text-main);
    }

    /* Action Buttons */
    .route-actions {
      display: flex;
      justify-content: flex-end;
      border-top: 1px solid var(--border-color);
      padding-top: 1.5rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.75rem 1.5rem;
      font-weight: 600;
      font-size: 0.9rem;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
    }

    .btn-primary {
      background-color: var(--primary);
      color: #fff;
    }

    .btn-primary:hover {
      background-color: var(--primary-hover);
      box-shadow: 0 0 15px rgba(59, 130, 246, 0.4);
    }

    footer {
      border-top: 1px solid var(--border-color);
      padding: 2rem;
      text-align: center;
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 3rem;
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
    }
    ::-webkit-scrollbar-track {
      background: var(--bg-color);
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  </style>
</head>
<body>

  <header>
    <div class="header-container">
      <div class="logo-container">
        <span class="logo-icon">V</span>
        <span class="logo-text">VITIX</span>
        <span class="logo-tagline">Performance as Code</span>
      </div>
      <div class="meta-time">Audited at: ${timestamp}</div>
    </div>
  </header>

  <main>
    <div class="summary-widgets">
      <div class="widget">
        <div class="widget-title">Overall Status</div>
        <div class="widget-value ${failedRoutes === 0 ? 'passed-text' : 'failed-text'}">
          ${failedRoutes === 0 ? 'PASSED' : 'FAILED'}
        </div>
      </div>
      <div class="widget">
        <div class="widget-title">Audited Routes</div>
        <div class="widget-value">${totalRoutes}</div>
      </div>
      <div class="widget">
        <div class="widget-title">Passed Routes</div>
        <div class="widget-value passed-text">${passedRoutes}</div>
      </div>
      <div class="widget">
        <div class="widget-title">Failed Routes</div>
        <div class="widget-value ${failedRoutes > 0 ? 'failed-text' : ''}">${failedRoutes}</div>
      </div>
      <div class="widget">
        <div class="widget-title">Duration</div>
        <div class="widget-value">${duration}s</div>
      </div>
    </div>

    <div class="sidebar">
      <div class="sidebar-title">Routes List</div>
      ${sidebarHtml}
    </div>

    <div class="content-area">
      ${routesHtml}
    </div>
  </main>

  <footer>
    <p>Vitix CLI v1.0.0 — Performance as Code for Next.js and React</p>
  </footer>

  <script>
    function showRoute(index) {
      // Hide all route items
      const routeItems = document.querySelectorAll('.route-item');
      routeItems.forEach(item => item.style.display = 'none');

      // Deactivate all sidebar items
      const sidebarItems = document.querySelectorAll('.sidebar-item');
      sidebarItems.forEach(item => item.classList.remove('active'));

      // Show selected route
      const selectedRoute = document.getElementById('route-' + index);
      if (selectedRoute) {
        selectedRoute.style.display = 'block';
      }

      // Activate selected sidebar item
      const activeBtn = document.getElementById('sidebar-btn-' + index);
      if (activeBtn) {
        activeBtn.classList.add('active');
      }
    }
  </script>
</body>
</html>
  `;
}

/**
 * Updates the historical runs catalog in history.json.
 */
export async function updateHistoryCatalog(
  baseOutputDir: string,
  runId: string,
  summary: VitixRunSummary
): Promise<void> {
  const historyPath = path.join(baseOutputDir, 'history.json');
  let history: any[] = [];
  
  if (await fs.pathExists(historyPath)) {
    try {
      history = await fs.readJson(historyPath);
      if (!Array.isArray(history)) history = [];
    } catch {
      history = [];
    }
  }

  // Calculate average category scores for this run
  const totalRoutes = summary.routes.length;
  const avgScores = { performance: 0, accessibility: 0, 'best-practices': 0, seo: 0 };
  
  if (totalRoutes > 0) {
    for (const r of summary.routes) {
      avgScores.performance += r.medianRun.scores.performance;
      avgScores.accessibility += r.medianRun.scores.accessibility;
      avgScores['best-practices'] += r.medianRun.scores['best-practices'];
      avgScores.seo += r.medianRun.scores.seo;
    }
    avgScores.performance = Math.round(avgScores.performance / totalRoutes);
    avgScores.accessibility = Math.round(avgScores.accessibility / totalRoutes);
    avgScores['best-practices'] = Math.round(avgScores['best-practices'] / totalRoutes);
    avgScores.seo = Math.round(avgScores.seo / totalRoutes);
  }

  const runMeta = {
    timestamp: summary.timestamp,
    runId,
    passed: summary.passed,
    routesCount: totalRoutes,
    avgScores,
    summaryPath: `runs/${runId}/summary.json`,
    reportPath: `runs/${runId}/index.html`,
  };

  history.unshift(runMeta); // Add to the beginning of the history list (newest first)
  
  // Keep only the last 100 runs in history
  if (history.length > 100) {
    history = history.slice(0, 100);
  }

  await fs.writeJson(historyPath, history, { spaces: 2 });
}

export function generatePrCommentMarkdown(summary: VitixRunSummary): string {
  const statusEmoji = summary.passed ? '🟢' : '🔴';
  const statusText = summary.passed ? 'PASSED' : 'FAILED';
  
  let md = `## ${statusEmoji} Vitix Performance Check: **${statusText}**\n\n`;
  md += `*Audited at: ${new Date(summary.timestamp).toUTCString()}*\n`;
  md += `*Total duration: ${(summary.durationMs / 1000).toFixed(2)}s*\n\n`;

  // 1. Routes Summary Table
  md += `### 📊 Routes Overview\n\n`;
  md += `| Route | Preset | Performance | Accessibility | Best Practices | SEO | Status |\n`;
  md += `| :--- | :--- | :---: | :---: | :---: | :---: | :---: |\n`;

  for (const r of summary.routes) {
    const run = r.medianRun;
    const statusSymbol = r.passed ? '🟢' : '🔴';
    md += `| \`${r.route}\` | \`${r.preset}\` | **${run.scores.performance}** | ${run.scores.accessibility} | ${run.scores['best-practices']} | ${run.scores.seo} | ${statusSymbol} |\n`;
  }
  md += `\n`;

  // 2. Violations
  const failedRoutes = summary.routes.filter(r => !r.passed);
  if (failedRoutes.length > 0) {
    md += `### ⚠️ Violations & Bottlenecks\n\n`;
    for (const r of failedRoutes) {
      md += `* **\`${r.route}\` (${r.preset})**:\n`;
      for (const v of r.violations) {
        md += `  - ${v}\n`;
      }
    }
    md += `\n`;
  }

  // 3. Baseline Diff
  if (summary.baselineDiffs && Object.keys(summary.baselineDiffs).length > 0) {
    md += `### 📈 Performance Changes (vs. Baseline)\n\n`;
    md += `| Route | Key | Baseline | Current | Difference | Status |\n`;
    md += `| :--- | :--- | :---: | :---: | :---: | :---: |\n`;

    for (const [route, routeDiffs] of Object.entries(summary.baselineDiffs)) {
      for (const [key, item] of Object.entries(routeDiffs)) {
        const isCat = key.startsWith('category:');
        const name = key.split(':')[1].toUpperCase();
        
        // Only show significant diffs (diff !== 0) to avoid cluttering the PR comment
        if (item.diff === 0) continue;

        const unit = isCat || name === 'CLS' ? '' : 'ms';
        const baseStr = `${item.baseline.toFixed(name === 'CLS' ? 3 : 0)}${unit}`;
        const currStr = `${item.current.toFixed(name === 'CLS' ? 3 : 0)}${unit}`;

        const isPositiveGood = isCat;
        const isImproved = isPositiveGood ? item.diff > 0 : item.diff < 0;
        const isRegressed = isPositiveGood ? item.diff < 0 : item.diff > 0;

        let statusText = 'No Change';
        if (isImproved) statusText = 'Improved 🚀';
        else if (isRegressed) statusText = 'Regressed ⚠️';

        const sign = item.diff > 0 ? '+' : '';
        const pctSign = item.diffPercent > 0 ? '+' : '';
        const diffStr = `${sign}${item.diff.toFixed(name === 'CLS' ? 3 : 0)}${unit} (${pctSign}${item.diffPercent}%)`;

        md += `| \`${route}\` | ${name} | ${baseStr} | ${currStr} | ${diffStr} | ${statusText} |\n`;
      }
    }
    md += `\n`;
  }

  // 4. RUM Comparison Table
  const routesWithRum = summary.routes.filter(r => r.rum);
  if (routesWithRum.length > 0) {
    md += `### 🌐 Real-User Metrics (CrUX Field) vs. Lighthouse (Synthetic Lab)\n\n`;
    md += `| Route | Preset | Metric | Lighthouse (Lab) | CrUX (Field) | Delta |\n`;
    md += `| :--- | :--- | :---: | :---: | :---: | :---: |\n`;

    for (const r of routesWithRum) {
      const crux = r.rum!;
      const lab = r.medianRun.metrics;
      
      const metricsToCheck: { key: string; name: string; unit: string }[] = [
        { key: 'LCP', name: 'LCP', unit: 'ms' },
        { key: 'CLS', name: 'CLS', unit: '' },
        { key: 'FCP', name: 'FCP', unit: 'ms' },
        { key: 'INP', name: 'INP', unit: 'ms' },
      ];

      for (const m of metricsToCheck) {
        const labVal = lab[m.key as CoreWebVitalKey] ?? 0;
        const cruxVal = (crux as any)[m.key] ?? 0;
        const diff = labVal - cruxVal;
        const sign = diff > 0 ? '+' : '';
        const diffStr = cruxVal > 0 ? `${sign}${diff.toFixed(m.key === 'CLS' ? 3 : 0)}${m.unit}` : 'N/A';

        md += `| \`${r.route}\` | \`${r.preset}\` | ${m.name} | ${labVal.toFixed(m.key === 'CLS' ? 3 : 0)}${m.unit} | ${cruxVal > 0 ? cruxVal.toFixed(m.key === 'CLS' ? 3 : 0) + m.unit : 'N/A'} | ${diffStr} |\n`;
      }
    }
    md += `\n`;
  }

  return md;
}

