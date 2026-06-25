import http from 'node:http';
import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import open from 'open';
import { loadConfig } from '../config/loader.js';

export interface ServeOptions {
  config?: string;
  port?: string;
  host?: string;
  ci?: boolean;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const SERVE_DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daha Historical Runs Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg-color: #0b0f19;
      --panel-bg: rgba(17, 24, 39, 0.7);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #6366f1;
      --accent-glow: rgba(99, 102, 241, 0.15);
      --success: #10b981;
      --failure: #ef4444;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-color);
      color: var(--text-main);
      font-family: 'Outfit', sans-serif;
      min-height: 100vh;
      padding: 2rem;
      background-image: radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.05) 0%, transparent 40%),
                        radial-gradient(circle at 90% 80%, rgba(168, 85, 247, 0.05) 0%, transparent 40%);
      background-attachment: fixed;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    header {
      margin-bottom: 2.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 800;
      background: linear-gradient(135deg, #a78bfa 0%, #6366f1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.25rem;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 1rem;
    }

    .card {
      background: var(--panel-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
    }

    .chart-container {
      height: 350px;
      position: relative;
    }

    .runs-table-container {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      padding: 1rem;
      color: var(--text-muted);
      font-weight: 600;
      border-bottom: 1px solid var(--border-color);
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    td {
      padding: 1.25rem 1rem;
      border-bottom: 1px solid var(--border-color);
      font-size: 0.95rem;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .badge-success {
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    .badge-failure {
      background: rgba(239, 68, 68, 0.15);
      color: var(--failure);
      border: 1px solid rgba(239, 68, 68, 0.25);
    }

    .score-list {
      display: flex;
      gap: 0.75rem;
    }

    .score-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      padding: 0.4rem 0.75rem;
      min-width: 55px;
      border: 1px solid var(--border-color);
    }

    .score-label {
      font-size: 0.65rem;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 0.2rem;
    }

    .score-val {
      font-weight: 600;
      font-size: 0.95rem;
    }

    .score-green { color: var(--success); }
    .score-orange { color: #f59e0b; }
    .score-red { color: var(--failure); }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--accent);
      color: white;
      text-decoration: none;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.9rem;
      transition: all 0.2s;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 12px var(--accent-glow);
      cursor: pointer;
    }

    .btn:hover {
      background: #4f46e5;
      transform: translateY(-1px);
    }

    .no-data {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--text-muted);
    }

    .no-data h3 {
      color: var(--text-main);
      margin-bottom: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Daha Historical Runs</h1>
        <div class="subtitle">Analyze local web performance metrics over time</div>
      </div>
      <div>
        <button class="btn" onclick="window.location.reload()">Refresh History</button>
      </div>
    </header>

    <div class="card">
      <div class="chart-container">
        <canvas id="historyChart"></canvas>
      </div>
    </div>

    <div class="card">
      <div class="runs-table-container">
        <table id="runsTable">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Run ID</th>
              <th>Routes</th>
              <th>Average Scores</th>
              <th>Status</th>
              <th>Report</th>
            </tr>
          </thead>
          <tbody id="runsTableBody">
            <!-- Populated dynamically -->
          </tbody>
        </table>
        <div id="noDataContainer" class="no-data" style="display: none;">
          <h3>No Audits Run Yet</h3>
          <p>Run <code>daha audit</code> to generate your first performance report.</p>
        </div>
      </div>
    </div>
  </div>

  <script>
    async function loadHistory() {
      try {
        const res = await fetch('/api/history');
        const history = await res.json();

        if (!history || history.length === 0) {
          document.getElementById('runsTable').style.display = 'none';
          document.getElementById('noDataContainer').style.display = 'block';
          return;
        }

        renderTable(history);
        renderChart(history);
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    }

    function formatDate(isoString) {
      const d = new Date(isoString);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function getScoreClass(score) {
      if (score >= 90) return 'score-green';
      if (score >= 50) return 'score-orange';
      return 'score-red';
    }

    function renderTable(history) {
      const tbody = document.getElementById('runsTableBody');
      tbody.innerHTML = '';

      history.forEach(run => {
        const tr = document.createElement('tr');
        
        // Date
        const tdDate = document.createElement('td');
        tdDate.textContent = formatDate(run.timestamp);
        tr.appendChild(tdDate);

        // Run ID
        const tdId = document.createElement('td');
        tdId.textContent = run.runId;
        tr.appendChild(tdId);

        // Routes Count
        const tdRoutes = document.createElement('td');
        tdRoutes.textContent = run.routesCount;
        tr.appendChild(tdRoutes);

        // Scores
        const tdScores = document.createElement('td');
        const scores = run.avgScores || { performance: 0, accessibility: 0, 'best-practices': 0, seo: 0 };
        tdScores.innerHTML = \`
          <div class="score-list">
            <div class="score-item">
              <span class="score-label">Perf</span>
              <span class="score-val \${getScoreClass(scores.performance)}">\${scores.performance}</span>
            </div>
            <div class="score-item">
              <span class="score-label">A11y</span>
              <span class="score-val \${getScoreClass(scores.accessibility)}">\${scores.accessibility}</span>
            </div>
            <div class="score-item">
              <span class="score-label">Best P</span>
              <span class="score-val \${getScoreClass(scores['best-practices'])}">\${scores['best-practices']}</span>
            </div>
            <div class="score-item">
              <span class="score-label">SEO</span>
              <span class="score-val \${getScoreClass(scores.seo)}">\${scores.seo}</span>
            </div>
          </div>
        \`;
        tr.appendChild(tdScores);

        // Status
        const tdStatus = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = \`badge \${run.passed ? 'badge-success' : 'badge-failure'}\`;
        badge.textContent = run.passed ? 'PASSED' : 'FAILED';
        tdStatus.appendChild(badge);
        tr.appendChild(tdStatus);

        // Report Link
        const tdReport = document.createElement('td');
        const a = document.createElement('a');
        a.className = 'btn';
        a.href = run.reportPath;
        a.target = '_blank';
        a.textContent = 'View Report';
        tdReport.appendChild(a);
        tr.appendChild(tdReport);

        tbody.appendChild(tr);
      });
    }

    function renderChart(history) {
      // Reverse array to show oldest first in the chart
      const chartRuns = [...history].reverse();
      const labels = chartRuns.map(run => {
        const d = new Date(run.timestamp);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      });

      const perfData = chartRuns.map(run => run.avgScores?.performance || 0);
      const a11yData = chartRuns.map(run => run.avgScores?.accessibility || 0);
      const bpData = chartRuns.map(run => run.avgScores?.['best-practices'] || 0);
      const seoData = chartRuns.map(run => run.avgScores?.seo || 0);

      const ctx = document.getElementById('historyChart').getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Performance',
              data: perfData,
              borderColor: '#10b981',
              backgroundColor: 'transparent',
              tension: 0.15,
              borderWidth: 3,
            },
            {
              label: 'Accessibility',
              data: a11yData,
              borderColor: '#6366f1',
              backgroundColor: 'transparent',
              tension: 0.15,
              borderWidth: 2,
            },
            {
              label: 'Best Practices',
              data: bpData,
              borderColor: '#f59e0b',
              backgroundColor: 'transparent',
              tension: 0.15,
              borderWidth: 2,
            },
            {
              label: 'SEO',
              data: seoData,
              borderColor: '#a78bfa',
              backgroundColor: 'transparent',
              tension: 0.15,
              borderWidth: 2,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: {
                color: '#9ca3af',
                font: { family: 'Outfit', size: 12 }
              }
            },
            tooltip: {
              titleFont: { family: 'Outfit' },
              bodyFont: { family: 'Outfit' }
            }
          },
          scales: {
            x: {
              ticks: { color: '#9ca3af', font: { family: 'Outfit', size: 10 } },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            },
            y: {
              min: 0,
              max: 100,
              ticks: { color: '#9ca3af', font: { family: 'Outfit', size: 11 } },
              grid: { color: 'rgba(255, 255, 255, 0.05)' }
            }
          }
        }
      });
    }

    window.onload = loadHistory;
  </script>
</body>
</html>
`;

export async function handleServeCommand(options: ServeOptions): Promise<void> {
  const config = await loadConfig(options.config);
  const baseOutputDir = path.resolve(process.cwd(), config.output?.dir || '.daha');
  const historyPath = path.join(baseOutputDir, 'history.json');

  let port = parseInt(options.port || '4000', 10);
  const host = options.host || 'localhost';

  const server = http.createServer(async (req, res) => {
    const urlPath = req.url ? new URL(req.url, `http://${host}:${port}`).pathname : '/';

    // 1. serve api history
    if (urlPath === '/api/history') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (await fs.pathExists(historyPath)) {
        try {
          const content = await fs.readFile(historyPath, 'utf8');
          res.end(content);
          return;
        } catch {
          // Fall through to empty array
        }
      }
      res.end('[]');
      return;
    }

    // 2. serve root serve page
    if (urlPath === '/' || urlPath === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SERVE_DASHBOARD_HTML);
      return;
    }

    // 3. serve static files from .daha
    // Resolve filePath, preventing directory traversal
    const relativePath = decodeURIComponent(urlPath).replace(/^\//, '');
    const targetFilePath = path.join(baseOutputDir, relativePath);

    if (targetFilePath.startsWith(baseOutputDir)) {
      if (await fs.pathExists(targetFilePath) && (await fs.stat(targetFilePath)).isFile()) {
        const ext = path.extname(targetFilePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        
        res.writeHead(200, { 'Content-Type': contentType });
        const stream = fs.createReadStream(targetFilePath);
        stream.pipe(res);
        return;
      }
    }

    // 4. Fallback 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  // Start server with port-in-use auto-increment
  const startServer = (portNum: number) => {
    server.listen(portNum, host, async () => {
      const serverUrl = `http://${host}:${portNum}`;
      console.log(chalk.green(`\n🚀 Daha Serve Dashboard is active!`));
      console.log(chalk.white(`Dashboard URL: ${chalk.bold.underline(serverUrl)}`));
      console.log(chalk.dim(`Serving history database from: ${historyPath}\n`));

      if (!options.ci) {
        try {
          await open(serverUrl);
        } catch {
          // Ignore opening error
        }
      }
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(chalk.yellow(`Port ${portNum} is busy, retrying on ${portNum + 1}...`));
        startServer(portNum + 1);
      } else {
        console.error(chalk.red(`Server error: ${err.message}`));
        process.exit(1);
      }
    });
  };

  startServer(port);
}
