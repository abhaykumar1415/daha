import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { globby } from 'globby';
import yaml from 'js-yaml';
import { table } from 'table';
import { loadConfig } from '../config/loader.js';
import { DahaRunSummary } from '../types/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const binPath = path.resolve(__dirname, '..', 'bin.js');

export interface PackageResult {
  name: string;
  dir: string;
  passed: boolean;
  summary: DahaRunSummary | null;
  error?: string;
}

export async function handleWorkspaceCommand(options: any): Promise<void> {
  const rootDir = process.cwd();
  const startTime = Date.now();

  console.log(chalk.bold.cyan('\n=== Daha Workspace Scanner ==='));
  
  const scanSpinner = ora('Scanning directory for monorepo packages...').start();
  const packages = await findWorkspacePackages(rootDir);
  
  if (packages.length === 0) {
    scanSpinner.fail(chalk.red('No child packages with Daha configuration found in workspace.'));
    process.exit(1);
  }
  scanSpinner.succeed(`Discovered ${packages.length} child package(s) with Daha configuration.`);

  // Prepare arguments for forwarding
  const forwardArgs: string[] = ['audit', '--ci'];
  if (options.runs) forwardArgs.push('--runs', options.runs);
  if (options.verbose) forwardArgs.push('--verbose');

  const concurrency = parseInt(options.concurrency || '2', 10);
  const results: PackageResult[] = [];
  const queue = [...packages];

  // Helper to format terminal scores
  const formatTerminalScore = (score: number): string => {
    if (score >= 90) return chalk.green(score);
    if (score >= 50) return chalk.yellow(score);
    return chalk.red(score);
  };

  const worker = async () => {
    while (queue.length > 0) {
      const packageDir = queue.shift()!;
      let packageName = path.basename(packageDir);
      
      // Attempt to load package.json for package name
      const pkgJsonPath = path.join(packageDir, 'package.json');
      if (await fs.pathExists(pkgJsonPath)) {
        try {
          const pkg = await fs.readJson(pkgJsonPath);
          if (pkg.name) packageName = pkg.name;
        } catch {}
      }

      const packageSpinner = !options.ci
        ? ora(`Auditing: ${chalk.cyan(packageName)}...`).start()
        : null;
      if (options.ci) {
        console.log(`📦 Auditing package: ${chalk.cyan(packageName)} (in ${path.relative(rootDir, packageDir)})...`);
      }

      try {
        const child = execa('node', [binPath, ...forwardArgs], {
          cwd: packageDir,
          reject: false,
        });

        const execResult = await child;
        const passed = execResult.exitCode === 0;

        // Load config to find the correct output path
        let outputDir = '.daha';
        const originalCwd = process.cwd();
        try {
          process.chdir(packageDir);
          const packageConfig = await loadConfig();
          outputDir = packageConfig.output?.dir || '.daha';
        } catch (err) {
          // Fallback
        } finally {
          process.chdir(originalCwd);
        }

        const summaryPath = path.join(packageDir, outputDir, 'latest', 'summary.json');
        let summary: DahaRunSummary | null = null;
        if (await fs.pathExists(summaryPath)) {
          summary = await fs.readJson(summaryPath);
        }

        if (packageSpinner) {
          if (passed) {
            packageSpinner.succeed(`✓ ${chalk.green(packageName)}: Passed`);
          } else {
            packageSpinner.fail(`✗ ${chalk.red(packageName)}: Failed`);
          }
        } else {
          if (passed) {
            console.log(`✓ ${chalk.green(packageName)}: Passed`);
          } else {
            console.log(`✗ ${chalk.red(packageName)}: Failed`);
          }
        }

        results.push({
          name: packageName,
          dir: packageDir,
          passed,
          summary,
        });
      } catch (err: any) {
        if (packageSpinner) {
          packageSpinner.fail(`✗ ${chalk.red(packageName)}: Error running audit: ${err.message}`);
        } else {
          console.log(`✗ ${chalk.red(packageName)}: Error running audit: ${err.message}`);
        }
        results.push({
          name: packageName,
          dir: packageDir,
          passed: false,
          summary: null,
          error: err.message,
        });
      }
    }
  };

  const workers = Array(Math.min(concurrency, queue.length)).fill(null).map(() => worker());
  await Promise.all(workers);

  // Print Terminal Report
  console.log('\n' + chalk.bold.cyan('=== Daha Workspace Audit Summary ===') + '\n');
  const headers = [
    chalk.bold('Package'),
    chalk.bold('Status'),
    chalk.bold('Routes Audited'),
    chalk.bold('Avg Perf'),
    chalk.bold('Avg A11y'),
    chalk.bold('Avg Best P.'),
    chalk.bold('Avg SEO')
  ];
  const rows = [headers];

  for (const res of results) {
    const statusStr = res.passed ? chalk.green.bold('PASSED ✓') : chalk.red.bold('FAILED ✗');
    if (res.summary) {
      const totalRoutes = res.summary.routes.length;
      let avgPerf = 0, avgA11y = 0, avgBp = 0, avgSeo = 0;
      if (totalRoutes > 0) {
        for (const r of res.summary.routes) {
          avgPerf += r.medianRun.scores.performance;
          avgA11y += r.medianRun.scores.accessibility;
          avgBp += r.medianRun.scores['best-practices'];
          avgSeo += r.medianRun.scores.seo;
        }
        avgPerf = Math.round(avgPerf / totalRoutes);
        avgA11y = Math.round(avgA11y / totalRoutes);
        avgBp = Math.round(avgBp / totalRoutes);
        avgSeo = Math.round(avgSeo / totalRoutes);
      }
      rows.push([
        chalk.white(res.name),
        statusStr,
        chalk.gray(totalRoutes.toString()),
        formatTerminalScore(avgPerf),
        formatTerminalScore(avgA11y),
        formatTerminalScore(avgBp),
        formatTerminalScore(avgSeo)
      ]);
    } else {
      rows.push([
        chalk.white(res.name),
        statusStr,
        chalk.gray('0'),
        chalk.red('N/A'),
        chalk.red('N/A'),
        chalk.red('N/A'),
        chalk.red('N/A')
      ]);
    }
  }
  console.log(table(rows));

  // Generate Workspace html report
  const workspaceOutDir = path.join(rootDir, '.daha', 'workspace');
  await fs.ensureDir(workspaceOutDir);

  const htmlPath = path.join(workspaceOutDir, 'index.html');
  const htmlContent = generateWorkspaceHtml(results, rootDir, Date.now() - startTime);
  await fs.writeFile(htmlPath, htmlContent, 'utf8');

  console.log(chalk.green(`\n✓ Workspace index report generated at: ${htmlPath}`));

  const allPassed = results.every(r => r.passed);
  if (!allPassed) {
    process.exit(1);
  }
  process.exit(0);
}

export async function findWorkspacePackages(rootDir: string): Promise<string[]> {
  const packages: string[] = [];

  // 1. Check pnpm-workspace.yaml
  const pnpmWorkspacePath = path.join(rootDir, 'pnpm-workspace.yaml');
  if (await fs.pathExists(pnpmWorkspacePath)) {
    try {
      const content = await fs.readFile(pnpmWorkspacePath, 'utf8');
      const doc = yaml.load(content) as any;
      if (doc && Array.isArray(doc.packages)) {
        const globbed = await globby(doc.packages, {
          cwd: rootDir,
          onlyDirectories: true,
          absolute: true,
          expandDirectories: false,
        });
        packages.push(...globbed);
      }
    } catch (err: any) {
      console.warn(chalk.yellow(`[Workspace Scanner] Failed to parse pnpm-workspace.yaml: ${err.message}`));
    }
  }

  // 2. Check package.json workspaces
  const rootPkgPath = path.join(rootDir, 'package.json');
  if (await fs.pathExists(rootPkgPath)) {
    try {
      const pkg = await fs.readJson(rootPkgPath);
      let workspaceGlobs: string[] | undefined;
      if (Array.isArray(pkg.workspaces)) {
        workspaceGlobs = pkg.workspaces;
      } else if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) {
        workspaceGlobs = pkg.workspaces.packages;
      }

      if (workspaceGlobs) {
        const globbed = await globby(workspaceGlobs, {
          cwd: rootDir,
          onlyDirectories: true,
          absolute: true,
          expandDirectories: false,
        });
        packages.push(...globbed);
      }
    } catch (err: any) {
      console.warn(chalk.yellow(`[Workspace Scanner] Failed to parse package.json workspaces: ${err.message}`));
    }
  }

  // 3. Fallback/scan for subfolders containing config files
  if (packages.length === 0) {
    const configGlob = await globby([
      '**/daha.config.ts',
      '**/daha.config.js',
      '**/daha.config.mjs',
      '**/.daharc.json',
      '**/.daharc.yaml',
      '**/.daharc.yml',
    ], {
      cwd: rootDir,
      ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**', '.daha/**'],
      absolute: true,
    });

    const dirsWithConfig = configGlob.map(file => path.dirname(file));
    packages.push(...dirsWithConfig);
  }

  // Remove duplicates and filter to directories that actually exist, are not the root dir itself
  const uniqueDirs = Array.from(new Set(packages))
    .filter(dir => dir !== rootDir && fs.statSync(dir).isDirectory());

  // Filter to directories that actually contain a daha configuration file
  const finalDirs: string[] = [];
  for (const dir of uniqueDirs) {
    const hasConfig = (
      await fs.pathExists(path.join(dir, 'daha.config.ts')) ||
      await fs.pathExists(path.join(dir, 'daha.config.js')) ||
      await fs.pathExists(path.join(dir, 'daha.config.mjs')) ||
      await fs.pathExists(path.join(dir, '.daharc.json')) ||
      await fs.pathExists(path.join(dir, '.daharc.yaml')) ||
      await fs.pathExists(path.join(dir, '.daharc.yml'))
    );
    if (hasConfig) {
      finalDirs.push(dir);
    }
  }

  return finalDirs;
}

export function generateWorkspaceHtml(results: PackageResult[], rootDir: string, durationMs: number): string {
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;
  const durationSec = (durationMs / 1000).toFixed(1);
  const timestamp = new Date().toLocaleString();

  // Helper to determine score color
  const getScoreColor = (score: number): string => {
    if (score >= 90) return '#10b981'; // Green
    if (score >= 50) return '#f59e0b'; // Orange
    return '#ef4444'; // Red
  };

  const packagesCardsHtml = results.map((res) => {
    const passedClass = res.passed ? 'status-passed' : 'status-failed';
    const statusText = res.passed ? 'PASSED' : 'FAILED';
    const relativeDir = path.relative(rootDir, res.dir);

    let summaryHtml = '';
    
    if (res.summary) {
      const totalRoutes = res.summary.routes.length;
      let avgPerf = 0, avgA11y = 0, avgBp = 0, avgSeo = 0;
      if (totalRoutes > 0) {
        for (const r of res.summary.routes) {
          avgPerf += r.medianRun.scores.performance;
          avgA11y += r.medianRun.scores.accessibility;
          avgBp += r.medianRun.scores['best-practices'];
          avgSeo += r.medianRun.scores.seo;
        }
        avgPerf = Math.round(avgPerf / totalRoutes);
        avgA11y = Math.round(avgA11y / totalRoutes);
        avgBp = Math.round(avgBp / totalRoutes);
        avgSeo = Math.round(avgSeo / totalRoutes);
      }

      // Calculate relative path to this package's index report html
      // Workspace index is at <rootDir>/.daha/workspace/index.html
      // Child report is at <res.dir>/.daha/latest/index.html (or whatever output dir)
      // Let's assume standard output dir is .daha for relative links
      const relativeReportPath = `../../${relativeDir.replace(/\\/g, '/')}/.daha/latest/index.html`;

      const routesRows = res.summary.routes.map(r => {
        const perf = r.medianRun.scores.performance;
        const a11y = r.medianRun.scores.accessibility;
        return `
          <tr>
            <td style="padding: 0.5rem 0; font-size: 0.9rem;"><code>${r.route}</code> (${r.preset})</td>
            <td style="padding: 0.5rem 0; font-weight: 600; text-align: center; color: ${getScoreColor(perf)}">${perf}</td>
            <td style="padding: 0.5rem 0; font-weight: 600; text-align: center; color: ${getScoreColor(a11y)}">${a11y}</td>
            <td style="padding: 0.5rem 0; text-align: right; color: ${r.passed ? '#10b981' : '#ef4444'}">${r.passed ? '✓ Pass' : '✗ Fail'}</td>
          </tr>
        `;
      }).join('');

      summaryHtml = `
        <div class="scores-summary">
          <div class="score-pill">
            <span class="score-val" style="color: ${getScoreColor(avgPerf)}">${avgPerf}</span>
            <span class="score-lbl">Perf</span>
          </div>
          <div class="score-pill">
            <span class="score-val" style="color: ${getScoreColor(avgA11y)}">${avgA11y}</span>
            <span class="score-lbl">A11y</span>
          </div>
          <div class="score-pill">
            <span class="score-val" style="color: ${getScoreColor(avgBp)}">${avgBp}</span>
            <span class="score-lbl">Best P.</span>
          </div>
          <div class="score-pill">
            <span class="score-val" style="color: ${getScoreColor(avgSeo)}">${avgSeo}</span>
            <span class="score-lbl">SEO</span>
          </div>
        </div>

        <div style="margin-top: 1.5rem;">
          <h4 style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 0.5rem; text-transform: uppercase;">Routes Audited (${totalRoutes})</h4>
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem; color: var(--text-muted);">
                <th style="padding-bottom: 0.25rem;">Route</th>
                <th style="padding-bottom: 0.25rem; text-align: center;">Perf</th>
                <th style="padding-bottom: 0.25rem; text-align: center;">A11y</th>
                <th style="padding-bottom: 0.25rem; text-align: right;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${routesRows}
            </tbody>
          </table>
        </div>

        <div class="card-actions">
          <a href="${relativeReportPath}" target="_blank" class="btn btn-primary">Open Child Package Report</a>
        </div>
      `;
    } else {
      const errorMsg = res.error || 'Failed to execute or fetch audit details.';
      summaryHtml = `
        <div class="error-box">
          <p><strong>Error executing audit:</strong></p>
          <p>${errorMsg}</p>
        </div>
      `;
    }

    return `
      <div class="package-card">
        <div class="package-header">
          <div>
            <h3>${res.name}</h3>
            <p class="package-path">📁 ${relativeDir}</p>
          </div>
          <span class="status-pill ${passedClass}">${statusText}</span>
        </div>
        ${summaryHtml}
      </div>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daha - Workspace Audits Dashboard</title>
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
      background-image: radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.08) 0%, transparent 40%),
                        radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.05) 0%, transparent 40%);
      padding-bottom: 3rem;
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

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    .header-container {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 1.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, #60a5fa 0%, #34d399 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .meta-tag {
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .summary-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 1.5rem;
      backdrop-filter: blur(8px);
      text-align: center;
    }

    .summary-card h3 {
      font-size: 0.9rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .summary-card .value {
      font-size: 2.5rem;
      font-weight: 700;
    }

    .packages-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
      gap: 2rem;
    }

    .package-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 1.5rem;
      backdrop-filter: blur(8px);
      display: flex;
      flex-direction: column;
    }

    .package-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 1rem;
    }

    .package-path {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    .status-pill {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      text-transform: uppercase;
    }

    .status-passed {
      background-color: rgba(16, 185, 129, 0.15);
      color: var(--passed-color);
    }

    .status-failed {
      background-color: rgba(239, 68, 68, 0.15);
      color: var(--failed-color);
    }

    .scores-summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .score-pill {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 0.5rem;
      text-align: center;
      display: flex;
      flex-direction: column;
    }

    .score-val {
      font-size: 1.5rem;
      font-weight: 700;
    }

    .score-lbl {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    .card-actions {
      margin-top: auto;
      padding-top: 1.5rem;
      display: flex;
      justify-content: flex-end;
    }

    .btn {
      display: inline-block;
      padding: 0.6rem 1.2rem;
      font-size: 0.85rem;
      font-weight: 600;
      border-radius: 8px;
      text-decoration: none;
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .btn-primary {
      background-color: var(--primary);
      color: white;
    }

    .btn-primary:hover {
      background-color: var(--primary-hover);
    }

    .error-box {
      background-color: rgba(239, 68, 68, 0.05);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 12px;
      padding: 1rem;
      color: #fca5a5;
      font-size: 0.9rem;
    }

    .error-box p {
      margin-bottom: 0.5rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-container">
      <div class="logo">Daha Workspace Dashboard</div>
      <div class="meta-tag">Generated: ${timestamp}</div>
    </div>
  </header>

  <main class="container">
    <div class="summary-grid">
      <div class="summary-card">
        <h3>Total Packages</h3>
        <div class="value" style="color: var(--primary);">${total}</div>
      </div>
      <div class="summary-card">
        <h3>Passed Packages</h3>
        <div class="value" style="color: var(--passed-color);">${passed}</div>
      </div>
      <div class="summary-card">
        <h3>Failed Packages</h3>
        <div class="value" style="color: var(--failed-color);">${failed}</div>
      </div>
      <div class="summary-card">
        <h3>Total Duration</h3>
        <div class="value" style="color: #a855f7;">${durationSec}s</div>
      </div>
    </div>

    <h2 style="margin-bottom: 1.5rem; font-size: 1.5rem;">Package Breakdown</h2>
    <div class="packages-grid">
      ${packagesCardsHtml}
    </div>
  </main>
</body>
</html>
  `;
}
