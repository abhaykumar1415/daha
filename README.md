# Daha

[![npm version](https://img.shields.io/npm/v/daha-cli.svg?style=flat-square)](https://www.npmjs.com/package/daha-cli)
[![node version](https://img.shields.io/badge/node-%3E%3D20.0.0-blue?style=flat-square)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/daha-cli.svg?style=flat-square)](https://github.com/abhaykumar1415/daha/blob/main/LICENSE)

> **Performance as Code for Modern Web Applications (Next.js, Remix, Astro, SvelteKit)**

**Daha** (`daha-cli` on npm) is a performance engineering CLI that automates Lighthouse audits, tracks Core Web Vitals, and monitors regressions across web apps and monorepos.

It discovers routes automatically, runs Lighthouse via Playwright, compares results against baselines, optionally overlays Chrome UX Report (CrUX) field data, and can notify Slack/Discord on failure.

---

## Key Features

- **Cross-framework route discovery** for Next.js (App + Pages), Remix, Astro, and SvelteKit
- **Stable audits** with multiple runs per route and median scoring
- **PR regression guard** with baseline comparison and CI-friendly exit codes
- **Real-user metrics (RUM)** via the CrUX API
- **ChatOps alerts** for Slack and Discord webhooks
- **Monorepo workspace** audits with a unified dashboard
- **Docker mode** (`--docker`) for consistent hardware baselines
- **One-command browser setup** (`daha setup`) with first-run auto-install

---

## Requirements

- Node.js `>= 20`
- A supported web app (Next.js, Remix, Astro, or SvelteKit)

---

## Installation

```bash
# project dependency (recommended)
npm install --save-dev daha-cli

# or globally
npm install -g daha-cli
```

The package exposes both binaries: `daha` and `daha-cli` (same CLI).

---

## Getting help

```bash
daha --help
daha -h
daha-cli --help

daha help init
daha init --help
daha audit --help
```

---

## Quick Start

From your app root:

```bash
# 1) Scaffold config + .gitignore (+ optional tsconfig exclude)
npx daha init -y

# 2) Install Playwright Chromium (also auto-runs on first audit if missing)
npx daha setup

# 3) List discovered routes
npx daha routes

# 4) Run a production audit
npx daha audit
```

Useful variants:

```bash
# Audit a single route against a running dev server on :3000
npx daha audit --dev -r /

# Faster local iteration
npx daha audit --runs 1 -r /

# CI mode + save baseline
npx daha audit --ci --baseline
```

---

## CLI Command Reference

### Global

| Command | Description |
|---------|-------------|
| `daha --help` | Show all commands and examples |
| `daha --version` | Print package version |
| `daha help <command>` | Show help for one command |

### `daha init`

Creates `daha.config.ts` and project scaffolding:

- Appends `.daha/` to `.gitignore` (creates the file if missing)
- Optionally excludes `daha.config.ts` from `tsconfig.json`
- Prints a next-steps checklist

| Option | Description |
|--------|-------------|
| `-y, --yes` | Skip prompts; apply recommended defaults |
| `--exclude-tsconfig` | Always update `tsconfig.json` |
| `--no-exclude-tsconfig` | Never modify `tsconfig.json` |

### `daha setup`

Installs Playwright Chromium used by Lighthouse.

| Option | Description |
|--------|-------------|
| `--force` | Reinstall even if Chromium is already present |

Audits also auto-install Chromium on first run when it is missing.

### `daha routes`

Lists discovered page routes.

| Option | Description |
|--------|-------------|
| `-c, --config <file>` | Custom config path |
| `--json` | Print routes as a JSON array |

### `daha audit`

Builds (unless skipped), starts the app server, and runs Lighthouse.

| Option | Description |
|--------|-------------|
| `-c, --config <file>` | Custom config path |
| `-r, --route <path>` | Audit only this route (e.g. `/blog`) |
| `--dev` | Skip build; expect server on port 3000 |
| `--ci` | Minimal CI-friendly output |
| `--baseline` | Save this run as the new baseline |
| `--mobile` / `--desktop` | Force preset |
| `--url <address>` | Audit a live URL (skip local build/server) |
| `--docker` | Run inside the Daha Docker image |
| `-o, --open` | Open the HTML report when done |
| `--verbose` | Verbose logs |
| `--runs <n>` | Override runs per route |
| `--concurrency <n>` | Override parallel route audits |
| `--timeout <ms>` | Override per-route timeout |

### `daha workspace`

Audits monorepo packages in parallel and writes a workspace index.

| Option | Description |
|--------|-------------|
| `--concurrency <n>` | Packages in parallel (default `2`) |
| `--runs <n>` | Override runs per route |
| `--ci` / `--verbose` | Propagate run styles |

### `daha serve`

Serves historical audit reports locally.

| Option | Description |
|--------|-------------|
| `-p, --port <number>` | Port (default `4000`) |
| `--host <string>` | Host binding |
| `--ci` | Do not auto-open the browser |

### `daha doctor`

Static checks for common performance issues (images, fonts, outdated frameworks, etc.).

### `daha watch`

Watches source files and re-runs targeted dev audits on change.

### `daha check`

Validates thresholds against an existing `summary.json`.

| Option | Description |
|--------|-------------|
| `-s, --summary <file>` | Path to summary JSON |
| `-c, --config <file>` | Custom config path |

### `daha init-hooks`

Installs a git pre-commit hook that runs performance checks.

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

Add `.daha/` to `.gitignore` (done automatically by `daha init`).

---

## CI/CD Pull Request Integration (GitHub Actions)

Create `.github/workflows/performance-audit.yml`:

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

      - name: Install Playwright Chromium
        run: npx daha setup

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

```bash
# Build local docker image
docker build -t daha .

# Execute audit inside container
daha audit --docker
```

---

## Contributing

### Development Setup

1. Clone and install:
   ```bash
   git clone git@github.com:abhaykumar1415/daha.git
   cd daha
   npm install
   ```

2. Run tests:
   ```bash
   npm test
   ```

3. Build:
   ```bash
   npm run build
   ```

4. Link locally (optional):
   ```bash
   npm link
   ```

### Contribution Rules

- Preserve existing comments and docstrings.
- Run `npm run build` and `npm test` before submitting.
- Add unit tests under `tests/` for new utilities, options, or commands.

---

## License

MIT © [Abhay Kumar](https://github.com/abhaykumar1415)
