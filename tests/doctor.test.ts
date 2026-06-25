import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import { handleDoctorCommand } from '../src/cli/doctor.js';

const TEST_DIR = path.resolve(process.cwd(), 'tests/temp_doctor_test');

describe('Doctor Performance diagnostics static analysis', () => {
  let consoleLogMock: any;
  let loggedOutput: string[] = [];

  beforeAll(async () => {
    // Setup mock project directory with performance violations
    await fs.ensureDir(TEST_DIR);
    
    // 1. package.json with outdated packages
    await fs.writeJson(path.join(TEST_DIR, 'package.json'), {
      dependencies: {
        next: '^13.0.0',
        react: '^17.0.2',
        astro: '^3.0.0',
      }
    });

    // 2. app directory with unoptimized image
    await fs.ensureDir(path.join(TEST_DIR, 'app'));
    await fs.writeFile(
      path.join(TEST_DIR, 'app/page.tsx'),
      `export default function Page() {
        return (
          <div>
            <h1>Hello World</h1>
            <img src="/banner.png" alt="banner" />
          </div>
        );
      }`
    );

    // 3. public directory with render blocking script
    await fs.ensureDir(path.join(TEST_DIR, 'public'));
    await fs.writeFile(
      path.join(TEST_DIR, 'public/index.html'),
      `<html>
        <head>
          <script src="/analytics.js"></script>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto">
        </head>
      </html>`
    );

    // Mock process.cwd() and console.log
    vi.spyOn(process, 'cwd').mockReturnValue(TEST_DIR);
    consoleLogMock = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      loggedOutput.push(msg);
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await fs.remove(TEST_DIR);
  });

  it('should run doctor diagnostics and output critical warnings/failures', async () => {
    await handleDoctorCommand({});

    const allLogs = loggedOutput.join('\n');

    // 1. Verify dependency warnings
    expect(allLogs).toContain('Outdated Next.js version');
    expect(allLogs).toContain('Legacy React version');
    expect(allLogs).toContain('Outdated Astro version');

    // 2. Verify unoptimized img element check
    expect(allLogs).toContain('Unoptimized <img> element detected');
    expect(allLogs).toContain('Image missing explicit width/height dimensions');

    // 3. Verify render blocking script check
    expect(allLogs).toContain('Render-blocking script detected');

    // 4. Verify Google Fonts preconnect warning
    expect(allLogs).toContain('Google Fonts loaded without preconnect optimizations');
  });
});
