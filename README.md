# Daha

[![npm version](https://img.shields.io/npm/v/daha-cli.svg?style=flat-square)](https://www.npmjs.com/package/daha-cli)
[![node version](https://img.shields.io/badge/node-%3E%3D20.0.0-blue?style=flat-square)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/daha.svg?style=flat-square)](https://github.com/abhaykumar/daha/blob/main/LICENSE)

> **Performance as Code for Modern Web Applications (Next.js, Remix, Astro, SvelteKit)**

**Daha** is an enterprise-ready performance engineering CLI tool that automates Lighthouse audits, tracks Core Web Vitals, and monitors regressions across web applications and monorepos. 

It discovers routes automatically, runs isolated Lighthouse audits via Playwright, compares results against historical baselines, fetches real-user metrics (RUM) via the Chrome UX Report (CrUX) API, and notifies developers through Slack/Discord webhook alerts.

---

## Key Features

- ⚡ **Cross-Framework Route Discovery**: Auto-scans directory files and manifests to map static and dynamic pages for **Next.js** (App and Pages routers), **Remix** (including flat routing), **Astro**, and **SvelteKit**.
- 🛠️ **Programmatic Worker Pool**: Runs multiple audits per route concurrently to calculate a stable median metric, avoiding variance issues. Supports authentication and cookies injection using Playwright.
- 📈 **PR Regression Guard**: Intercepts pull requests, compares audits to baseline files, and fails CI pipelines if performance drops beyond customizable margins.
- 🌐 **Real-User Metrics (RUM)**: Queries Google's Chrome UX Report (CrUX) API to overlay real-user field experiences side-by-side with synthetic lab audits.
- 💬 **ChatOps Webhook Alerts**: Formats and dispatches detailed test outcomes directly to developer channels on **Slack** (Block Kit format) or **Discord** (Embed formatting) on failure.
- 📦 **Monorepo Workspaces**: Scans root projects (Yarn, NPM, PNPM workspaces), runs concurrent package audits in isolation, and outputs a unified central workspace dashboard.
- 🐳 **Consistent Sandboxed Audits**: Launches single-command audits inside a Docker container (`--docker`) to eliminate developer hardware skew.

---

## Installation

Install globally for quick CLI use:

```bash
npm install -g daha-cli
```

Or add as a project dependency:

```bash
npm install --save-dev daha-cli
```

---

## Quick Start

### 1. Initialize Config
Generate a default `daha.config.ts` configuration file:

```bash
daha init
```

### 2. Verify Routes
Test your route scanner configuration to see what paths will be audited:

```bash
daha routes
```

### 3. Execute Audits
Build your production assets, start a local server, and run Lighthouse checks:

```bash
daha audit
```

---

## CLI Command Reference

### `daha init`
Initializes a fully annotated `daha.config.ts` file in the current directory.

### `daha routes`
Scans and displays all detected page routes.
- `-c, --config <file>`: Custom configuration path.
- `--json`: Output as a raw JSON array.

### `daha audit`
Compiles, runs local servers, and executes Lighthouse audits.
- `-c, --config <file>`: Custom configuration path.
- `-r, --route <path>`: Focus audit on a single route (e.g. `/blog`).
- `--dev`: Dev mode (skips build, audits against an active server at port 3000).
- `--ci`: CI mode (disables spinners and progress bars).
- `--baseline`: Saves the results of this audit as the new historical baseline.
- `--mobile` / `--desktop`: Force mobile or desktop presets.
- `--url <address>`: Audits a live deployed URL directly, skipping build and server launch.
- `--docker`: Executes the audit inside a Docker container (requires Docker installed).
- `-o, --open`: Opens the HTML dashboard in a browser after completing the audit.
- `--verbose`: Prints verbose logs.

### `daha workspace`
Finds child projects in monorepos, audits them in parallel, and compiles a centralized index.
- `--concurrency <number>`: Number of packages to audit in parallel (default: `2`).
- `--runs <number>`: Override runs per route.
- `--ci` / `--verbose`: Propagate run styles.

### `daha serve`
Spins up a local server to explore historical reports and performance graphs.
- `-p, --port <number>`: Override port (default: `4000`).
- `--host <string>`: Server host binding.
- `--ci`: Run without auto-opening the browser.

### `daha doctor`
Runs static analysis on files catching layout shift, missing font preconnect tags, or unoptimized image sources.

### `daha watch`
Monitors local file changes and triggers instant dev audits for targeted routes.

### `daha check`
Validates threshold rules against a pre-existing `summary.json` run output.
- `-s, --summary <file>`: Path to the target summary output.

---

## Configuration API (`daha.config.ts`)

```typescript
import { DahaConfig } from 'daha-cli';

const config: DahaConfig = {
  // Routes to audit. 'auto' discovers pages. Or pass a string array: ['/', '/about']
  routes: 'auto',

  // Parameters to interpolate dynamic path placeholders
  dynamicRouteParams: {
    '/blog/[slug]': ['hello-world', 'performance-audit-guide'],
    '/shop/[category]/[id]': [
      { category: 'shoes', id: '10' },
      { category: 'shirts', id: '20' }
    ]
  },

  // Threshold bounds. Failures exit CLI with status 1
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
    },
    budgets: {
      maxTotalJsSizeKb: 500,
      maxTotalCssSizeKb: 100,
      maxTotalImageSizeKb: 1000,
      maxThirdPartyRequests: 5
    }
  },

  // Executing options
  options: {
    numberOfRuns: 3,
    preset: 'mobile', // 'mobile' | 'desktop' | 'both'
    concurrency: 1,
    timeoutMs: 60000,
    setupScript: './tests/auth-setup.js' // Inject authentication cookies/tokens
  },

  // Build & Server configuration
  build: {
    command: 'npm run build',
    dir: '.next'
  },
  server: {
    command: 'npm run start',
    port: 3000
  },

  // Outputs & History
  output: {
    dir: '.daha',
    formats: ['html', 'json', 'csv', 'junit']
  },
  baseline: {
    enabled: true,
    dir: '.daha/baseline'
  },

  // CI limits & metric regression checks
  ci: {
    strict: true,
    junit: true,
    maxPerformanceRegressionPercent: 5,
    maxMetricRegressionPercent: {
      LCP: 10,
      CLS: 15
    }
  },

  // Slack/Discord ChatOps
  notifications: {
    webhookUrl: 'https://hooks.slack.com/services/T0000/B0000/XXXX',
    onFailureOnly: true
  },

  // Real-User Metrics (Google CrUX API)
  rum: {
    cruxApiKey: 'GOOGLE_DEVELOPER_API_KEY',
    origin: 'https://mywebsite.com' // Origin for matching field data
  }
};

export default config;
```

---

## CI/CD Pull Request Integration (GitHub Actions)

Create a workflow file `.github/workflows/performance-audit.yml`:

```yaml
name: Performance Guard

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright (Chrome)
        run: npx playwright install chromium

      - name: Run Daha Audits
        run: npx daha audit --ci --baseline
        env:
          GOOGLE_CRUX_API_KEY: ${{ secrets.GOOGLE_CRUX_API_KEY }}

      - name: Comment PR with Results
        if: github.event_name == 'pull_request' && always()
        uses: mshick/add-pr-comment@v2
        with:
          message-path: .daha/latest/pr_comment.md
```

---

## Sandbox Containerized Audits (Docker)

To isolate audits from local CPU throttle differences and run them on a consistent hardware baseline, build the Dockerfile and pass `--docker`:

```bash
# Build local docker image
docker build -t daha .

# Execute audit inside container
daha audit --docker
```

---

## Contributing

We welcome community contributions! Please read our guidelines to get started.

### Development Setup

1. **Clone repository**:
   ```bash
   git clone git@github.com:abhaykumar1415/daha.git
   cd daha
   npm install
   ```

2. **Verify tests**:
   Make sure all 52 unit tests pass:
   ```bash
   npm run test
   ```

3. **Build TypeScript compiler**:
   ```bash
   npm run build
   ```

4. **Link CLI locally**:
   ```bash
   npm link
   ```

### Contribution Rules
- Always preserve code docstrings and comments.
- Ensure type checks pass by running `npm run build` locally before submitting.
- Add corresponding unit tests inside `tests/` for any new utility, runner option, or CLI command.

---

## License

MIT © [Abhay Kumar](https://github.com/abhaykumar1415)
