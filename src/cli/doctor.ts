import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { globby } from 'globby';

export interface DoctorOptions {
  config?: string;
}

interface DiagnosticResult {
  category: 'dependency' | 'image' | 'script' | 'font';
  status: 'pass' | 'warn' | 'fail';
  title: string;
  message: string;
  file?: string;
  line?: number;
  fixSuggestion?: string;
}

export async function handleDoctorCommand(_options: DoctorOptions): Promise<void> {
  console.log(chalk.bold.cyan('\n🩺 Running Vitix Doctor diagnostics...\n'));

  const projectDir = process.cwd();
  const diagnostics: DiagnosticResult[] = [];

  // 1. Dependency Analysis
  const pkgPath = path.join(projectDir, 'package.json');
  if (await fs.pathExists(pkgPath)) {
    try {
      const pkg = await fs.readJson(pkgPath);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      // Next.js check
      if (deps.next) {
        const version = cleanVersion(deps.next);
        const major = parseInt(version.split('.')[0], 10);
        if (major < 14) {
          diagnostics.push({
            category: 'dependency',
            status: 'warn',
            title: `Outdated Next.js version (${deps.next})`,
            message: 'Next.js 14+ introduces significant compile and server-side performance improvements, bundle size optimizations, and the Turbopack compiler.',
            fixSuggestion: 'Run `npm install next@latest react@latest react-dom@latest` to upgrade.',
          });
        } else {
          diagnostics.push({
            category: 'dependency',
            status: 'pass',
            title: 'Next.js dependency is up to date',
            message: `Currently utilizing Next.js ${deps.next}.`,
          });
        }
      }

      // React check
      if (deps.react) {
        const version = cleanVersion(deps.react);
        const major = parseInt(version.split('.')[0], 10);
        if (major < 18) {
          diagnostics.push({
            category: 'dependency',
            status: 'fail',
            title: `Legacy React version (${deps.react})`,
            message: 'React 18+ is required for concurrency, transitions, streaming HTML, and optimized component hydration.',
            fixSuggestion: 'Upgrade react by running `npm install react@18 react-dom@18`.',
          });
        }
      }

      // Remix check
      if (deps['@remix-run/react']) {
        const version = cleanVersion(deps['@remix-run/react']);
        const major = parseInt(version.split('.')[0], 10);
        if (major < 2) {
          diagnostics.push({
            category: 'dependency',
            status: 'warn',
            title: `Outdated Remix version (${deps['@remix-run/react']})`,
            message: 'Remix v2 introduces built-in CSS bundling, improved routing conventions, and smaller bundle sizes.',
            fixSuggestion: 'Follow the Remix v2 migration guide to upgrade.',
          });
        }
      }

      // Astro check
      if (deps.astro) {
        const version = cleanVersion(deps.astro);
        const major = parseInt(version.split('.')[0], 10);
        if (major < 4) {
          diagnostics.push({
            category: 'dependency',
            status: 'warn',
            title: `Outdated Astro version (${deps.astro})`,
            message: 'Astro 4+ features faster builds, Dev Toolbar optimizations, and optimized asset handling.',
            fixSuggestion: 'Run `npm install astro@latest` to upgrade.',
          });
        }
      }
    } catch {
      diagnostics.push({
        category: 'dependency',
        status: 'warn',
        title: 'Failed to read package.json',
        message: 'Diagnostics skipped package.json dependencies parsing.',
      });
    }
  } else {
    diagnostics.push({
      category: 'dependency',
      status: 'warn',
      title: 'package.json not found',
      message: 'Ensure you run Vitix inside a Node project directory.',
    });
  }

  // 2. Source Code Static Performance Scan
  const srcDirectories = ['src', 'app', 'pages', 'components', 'routes'];
  const activeSrcDirs = [];
  for (const dir of srcDirectories) {
    if (await fs.pathExists(path.join(projectDir, dir))) {
      activeSrcDirs.push(dir);
    }
  }

  if (activeSrcDirs.length > 0) {
    const globPattern = activeSrcDirs.map(d => `${d}/**/*.{ts,tsx,js,jsx,svelte,astro}`).concat(['public/**/*.html']);
    const files = await globby(globPattern, { cwd: projectDir, ignore: ['**/node_modules/**', '**/.next/**'] });

    for (const file of files) {
      try {
        const relativePath = file;
        const absolutePath = path.join(projectDir, file);
        const content = await fs.readFile(absolutePath, 'utf8');

        // Check for plain <img> tags without optimizations
        const isNextFile = file.includes('app/') || file.includes('pages/') || file.includes('components/');
        const imgRegex = /<img\s[^>]*>/gi;
        let match;
        
        while ((match = imgRegex.exec(content)) !== null) {
          const imgTag = match[0];
          const lineIndex = content.substring(0, match.index).split('\n').length;
          
          const hasLazy = /\bloading=["']lazy["']/i.test(imgTag);
          const hasWidth = /\bwidth=/i.test(imgTag);
          const hasHeight = /\bheight=/i.test(imgTag);

          if (isNextFile && !content.includes('next/image')) {
            diagnostics.push({
              category: 'image',
              status: 'warn',
              title: 'Unoptimized <img> element detected',
              message: 'Using raw <img> tags in Next.js causes layout shifts and bypasses automatic size/WebP generation optimizations.',
              file: relativePath,
              line: lineIndex,
              fixSuggestion: 'Use Next.js `<Image>` from `next/image` with predefined dimensions.',
            });
          } else if (!hasLazy) {
            diagnostics.push({
              category: 'image',
              status: 'warn',
              title: 'Image missing lazy loading attribute',
              message: 'Images should specify `loading="lazy"` to defer loading off-screen images until viewport visibility, saving bandwidth.',
              file: relativePath,
              line: lineIndex,
              fixSuggestion: 'Add `loading="lazy"` attribute to the image element.',
            });
          }

          if (!hasWidth || !hasHeight) {
            diagnostics.push({
              category: 'image',
              status: 'fail',
              title: 'Image missing explicit width/height dimensions',
              message: 'Missing image dimensions cause Cumulative Layout Shift (CLS) as pages load and resize.',
              file: relativePath,
              line: lineIndex,
              fixSuggestion: 'Define explicit `width` and `height` properties on the element.',
            });
          }
        }

        // Check for render-blocking scripts in HTML files
        if (file.endsWith('.html')) {
          const scriptRegex = /<script\s[^>]*src=[^>]*>/gi;
          let scriptMatch;
          while ((scriptMatch = scriptRegex.exec(content)) !== null) {
            const scriptTag = scriptMatch[0];
            const lineIndex = content.substring(0, scriptMatch.index).split('\n').length;
            const hasAsync = /\basync\b/i.test(scriptTag);
            const hasDefer = /\bdefer\b/i.test(scriptTag);
            const isModule = /\btype=["']module["']/i.test(scriptTag);

            if (!hasAsync && !hasDefer && !isModule) {
              diagnostics.push({
                category: 'script',
                status: 'fail',
                title: 'Render-blocking script detected',
                message: 'Scripts without async/defer block the main thread, delaying DOM parsing and increasing First Contentful Paint (FCP).',
                file: relativePath,
                line: lineIndex,
                fixSuggestion: 'Add `defer` (recommended for dependency execution) or `async` (for self-contained analytics scripts) to the script element.',
              });
            }
          }
        }

        // Check for Google Fonts without preconnect in files that link them
        if (content.includes('fonts.googleapis.com')) {
          const lineIndex = content.substring(0, content.indexOf('fonts.googleapis.com')).split('\n').length;
          const preconnectTemplate = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>';
          
          if (!content.includes('fonts.gstatic.com') || !content.includes('rel="preconnect"')) {
            diagnostics.push({
              category: 'font',
              status: 'warn',
              title: 'Google Fonts loaded without preconnect optimizations',
              message: 'Loading external fonts requires DNS, TCP, and TLS handshakes. Preconnecting to gstatic saves up to 100-300ms during font load.',
              file: relativePath,
              line: lineIndex,
              fixSuggestion: 'Add preconnect link tags to your document <head>:\n' + preconnectTemplate,
            });
          }
        }

      } catch {
        // Ignore file read errors
      }
    }
  }

  // 3. Print Results
  const passed = diagnostics.filter(d => d.status === 'pass');
  const warned = diagnostics.filter(d => d.status === 'warn');
  const failed = diagnostics.filter(d => d.status === 'fail');

  // Print Summary Header
  console.log(chalk.bold('Summary Checklist:'));
  console.log(`  Passed:  ${chalk.green(passed.length)}`);
  console.log(`  Warnings: ${chalk.yellow(warned.length)}`);
  console.log(`  Failures: ${chalk.red(failed.length)}\n`);

  if (diagnostics.length === 0) {
    console.log(chalk.green('✓ No issues detected! Your source structure aligns with performance best practices. 🎉\n'));
    return;
  }

  // Print Details
  const printDiagnostic = (d: DiagnosticResult) => {
    let statusMarker = '';
    if (d.status === 'pass') statusMarker = chalk.green('✓ [PASS]');
    else if (d.status === 'warn') statusMarker = chalk.yellow('⚠️ [WARN]');
    else statusMarker = chalk.red('❌ [FAIL]');

    const fileLine = d.file ? ` (${chalk.underline(d.file)}${d.line ? `:${d.line}` : ''})` : '';
    console.log(`${statusMarker} ${chalk.bold(d.title)}${fileLine}`);
    console.log(`  ${chalk.dim(d.message)}`);
    if (d.fixSuggestion) {
      console.log(`  ${chalk.cyan(`Fix suggestion: ${d.fixSuggestion}`)}`);
    }
    console.log('');
  };

  if (failed.length > 0) {
    console.log(chalk.bold.red('=== Critical Failures ==='));
    failed.forEach(printDiagnostic);
  }

  if (warned.length > 0) {
    console.log(chalk.bold.yellow('=== Warnings & Opportunities ==='));
    warned.forEach(printDiagnostic);
  }

  if (passed.length > 0) {
    console.log(chalk.bold.green('=== Verified Checks ==='));
    passed.forEach(printDiagnostic);
  }
}

function cleanVersion(v: string): string {
  // Strip characters like ^, ~, >=, <=, etc.
  return v.replace(/[\^~>=<]/g, '').trim();
}
