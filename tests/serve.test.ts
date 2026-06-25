import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import path from 'node:path';
import fs from 'fs-extra';

const TEST_PORT = 4999;
const TEST_HOST = 'localhost';
const TEST_DIR = path.resolve(process.cwd(), 'tests/temp_serve_test');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const SERVE_DASHBOARD_HTML = `<html>Daha Historical Runs</html>`;

// Test-specific server creator utilizing the exact same routing logic as src/cli/serve.ts
function createTestServer(baseOutputDir: string, historyPath: string) {
  return http.createServer(async (req, res) => {
    const urlPath = req.url ? new URL(req.url, `http://${TEST_HOST}:${TEST_PORT}`).pathname : '/';

    if (urlPath === '/api/history') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (await fs.pathExists(historyPath)) {
        try {
          const content = await fs.readFile(historyPath, 'utf8');
          res.end(content);
          return;
        } catch {
          // Ignore
        }
      }
      res.end('[]');
      return;
    }

    if (urlPath === '/' || urlPath === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SERVE_DASHBOARD_HTML);
      return;
    }

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

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
}

describe('Serve Dashboard Server', () => {
  let server: http.Server;
  const historyPath = path.join(TEST_DIR, 'history.json');
  const dummyReportPath = path.join(TEST_DIR, 'runs/run_dummy/index.html');

  beforeAll(async () => {
    await fs.ensureDir(TEST_DIR);
    await fs.ensureDir(path.join(TEST_DIR, 'runs/run_dummy'));
    
    // Create mock history
    const mockHistory = [
      {
        timestamp: new Date().toISOString(),
        runId: 'run_dummy',
        passed: true,
        routesCount: 1,
        avgScores: { performance: 95, accessibility: 90, 'best-practices': 95, seo: 100 },
        summaryPath: 'runs/run_dummy/summary.json',
        reportPath: 'runs/run_dummy/index.html'
      }
    ];
    await fs.writeJson(historyPath, mockHistory);

    // Create mock report file
    await fs.writeFile(dummyReportPath, '<html>Dummy Report</html>');

    // Start server
    server = createTestServer(TEST_DIR, historyPath);
    await new Promise<void>((resolve) => {
      server.listen(TEST_PORT, TEST_HOST, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await fs.remove(TEST_DIR);
  });

  it('should serve the dashboard HTML on root', async () => {
    const res = await fetch(`http://${TEST_HOST}:${TEST_PORT}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const text = await res.text();
    expect(text).toContain('Daha Historical Runs');
  });

  it('should serve history JSON on /api/history', async () => {
    const res = await fetch(`http://${TEST_HOST}:${TEST_PORT}/api/history`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const json = await res.json();
    expect(json).toBeInstanceOf(Array);
    expect(json[0].runId).toBe('run_dummy');
  });

  it('should serve static run reports under /runs/*', async () => {
    const res = await fetch(`http://${TEST_HOST}:${TEST_PORT}/runs/run_dummy/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const text = await res.text();
    expect(text).toBe('<html>Dummy Report</html>');
  });

  it('should return 404 for non-existent files', async () => {
    const res = await fetch(`http://${TEST_HOST}:${TEST_PORT}/runs/non-existent.html`);
    expect(res.status).toBe(404);
  });
});
