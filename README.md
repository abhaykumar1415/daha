# Vitix

[![npm version](https://img.shields.io/npm/v/vitix.svg?style=flat-square)](https://www.npmjs.com/package/vitix)
[![build status](https://img.shields.io/github/actions/workflow/status/abhaykumar/vitix/ci.yml?branch=main&style=flat-square)](#)
[![node version](https://img.shields.io/badge/node-%3E%3D20.0.0-blue?style=flat-square)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/vitix.svg?style=flat-square)](https://github.com/abhaykumar/vitix/blob/main/LICENSE)

> **Performance as Code for Next.js & React Applications**

**Vitix** is a developer-focused CLI tool that automates Lighthouse audits on production builds. It discovers routes automatically from your Next.js directory (supporting App Router & Pages Router), executes reliable performance audits, asserts Core Web Vitals thresholds, and exports detailed summaries and a premium HTML dashboard.

---

## Features

- **Project & Environment Auto-Detection**: Supports Next.js App Router (`app/` page directories) and Pages Router (`pages/` files).
- **Advanced Route Discovery**: Traverses the filesystem or compiled `.next` build manifests to find public paths while ignoring parallel slots (`@*`), private folders (`_*`), and API routes.
- **Dynamic Parameter Expansion**: Resolves parameterized routes (e.g. `/blog/[slug]`) into concrete paths using parameter mappings from config.
- **Programmatic Lighthouse runner**: Orchestrated via Playwright. Executes multiple runs per route to calculate a stable median score.
- **CI Integration Ready**: Generates standard JUnit XML files and exits with code `1` on threshold violations to fail CI pipelines.
- **Baseline Metrics Comparisons**: Enables checking current performance changes against previous runs, highlighting regressions.
- **Rich Dashboard Reporting**: Creates clean terminal summary tables and exports a glassmorphic dark-mode HTML dashboard.

---

## Installation

Install globally via `npm`:

```bash
npm install -g vitix
```

Or install locally in your project as a devDependency:

```bash
npm install --save-dev vitix
```

---

## Quick Start

### 1. Initialize Configuration
Generate a default `vitix.config.ts` configuration file:

```bash
vitix init
```

### 2. Discovered Routes Check
Verify that Vitix discovers your route structure correctly:

```bash
vitix routes
```

### 3. Run Performance Audits
Compile the production build, launch the server, and audit pages:

```bash
vitix audit
```

---

## CLI Command Reference

### `vitix init`
Creates a commented `vitix.config.ts` configuration file.

### `vitix routes [options]`
Lists discovered routes in terminal or raw JSON formats.
- `-c, --config <file>`: Specify custom configuration file.
- `--json`: Output routes list as a JSON array.

### `vitix audit [options]`
Runs production build, starts server, runs Lighthouse audits, and exports reports.
- `-c, --config <file>`: Custom configuration file path.
- `-r, --route <path>`: Audit only a single route (e.g. `/about`).
- `--dev`: Skip build phase (expects the server to be already running on port 3000).
- `--ci`: CI mode (suppresses progress spinners and progress bars).
- `--baseline`: Copy current summary report to the baseline folder.
- `--mobile`: Force mobile preset.
- `--desktop`: Force desktop preset.
- `--verbose`: Print detailed logs for debugging.

### `vitix check [options]`
Asserts performance thresholds against a pre-existing summary JSON report without re-executing audits.
- `-c, --config <file>`: Custom configuration path.
- `-s, --summary <file>`: Path to the target `summary.json` file.

---

## Configuration API Reference

A sample `vitix.config.ts`:

```typescript
import { VitixConfig } from 'vitix';

const config: VitixConfig = {
  // Routes to audit. 'auto' performs automatic discovery.
  routes: 'auto',

  // Parameters to interpolate dynamic pages
  dynamicRouteParams: {
    '/blog/[slug]': ['first-post', 'modern-web-vitals'],
    '/shop/[category]/[id]': [
      { category: 'shoes', id: '10' },
      { category: 'shirts', id: '20' }
    ]
  },

  // Thresholds to assert. Failures throw exit code 1.
  thresholds: {
    categories: {
      performance: 90,
      accessibility: 90,
      'best-practices': 95,
      seo: 90
    },
    metrics: {
      LCP: { max: 2500 }, // Largest Contentful Paint (ms)
      CLS: { max: 0.1 },  // Cumulative Layout Shift
      TBT: { max: 300 }   // Total Blocking Time (ms)
    }
  },

  // Runner options
  options: {
    numberOfRuns: 3,
    preset: 'mobile', // 'mobile' | 'desktop' | 'both'
    concurrency: 1,
    timeoutMs: 60000
  },

  // Build commands
  build: {
    command: 'npm run build',
    dir: '.next'
  },

  // Server commands
  server: {
    command: 'npm run start',
    port: 3000
  },

  // Outputs
  output: {
    dir: '.vitix',
    formats: ['html', 'json', 'junit'],
    openReport: false
  }
};

export default config;
```

---

## GitHub Actions CI Integration

You can integrate Vitix in your GitHub Actions workflow using the pre-packaged Dockerfile or local npm installations. Here is a sample workflow using local installation:

```yaml
name: Performance Audits

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  performance-audit:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Install Playwright Browsers (Chrome)
        run: npx playwright install chromium

      - name: Run Vitix Audits
        run: npx vitix audit --ci --baseline

      - name: Upload Audit Dashboard
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: vitix-report
          path: .vitix/
```

---

## Docker Support

Run Vitix audits in Docker using our official image:

```bash
# Build the Docker image
docker build -t vitix .

# Run audits on a mounted directory
docker run --rm -v $(pwd):/usr/src/app vitix audit --ci
```

---

## Development & Contribution

We use `vitest` for tests and `esbuild` for bundling.

1. Clone and install dependencies:
   ```bash
   git clone https://github.com/abhaykumar/vitix.git
   cd vitix
   npm install
   ```

2. Run unit tests:
   ```bash
   npm run test
   ```

3. Run in development:
   ```bash
   npm run dev -- --help
   ```

4. Build production code:
   ```bash
   npm run build
   ```

---

## License

MIT © [Abhay Kumar](https://github.com/abhaykumar)
