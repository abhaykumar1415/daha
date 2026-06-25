import path from 'node:path';
import fs from 'fs-extra';
import { globby } from 'globby';
import { chromium } from 'playwright';
import { DiscoveryError } from '../utils/errors.js';
import { ParsedVitixConfig } from '../types/config.js';

export interface RouteDiscoveryResult {
  routes: string[];
  source: 'filesystem' | 'manifests' | 'crawler';
}

/**
 * Checks if the target directory is a Next.js project.
 */
export async function detectNextJsProject(projectDir: string): Promise<boolean> {
  const nextConfigExists = 
    await fs.pathExists(path.join(projectDir, 'next.config.js')) ||
    await fs.pathExists(path.join(projectDir, 'next.config.mjs')) ||
    await fs.pathExists(path.join(projectDir, 'next.config.ts'));
    
  if (nextConfigExists) return true;

  const pkgPath = path.join(projectDir, 'package.json');
  if (await fs.pathExists(pkgPath)) {
    try {
      const pkg = await fs.readJson(pkgPath);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.next) return true;
    } catch {
      // Ignore reading error
    }
  }

  return false;
}

/**
 * Discovers routes using Next.js build manifests.
 */
async function discoverFromManifests(nextBuildDir: string): Promise<string[] | null> {
  const routesManifestPath = path.join(nextBuildDir, 'routes-manifest.json');
  const appManifestPath = path.join(nextBuildDir, 'app-paths-manifest.json');
  const pagesManifestPath = path.join(nextBuildDir, 'server', 'pages-manifest.json');

  const routes = new Set<string>();
  let manifestFound = false;

  // 1. Try reading routes-manifest.json (most comprehensive for pages router + static routes)
  if (await fs.pathExists(routesManifestPath)) {
    manifestFound = true;
    try {
      const content = await fs.readJson(routesManifestPath);
      
      // Static routes
      if (Array.isArray(content.staticRoutes)) {
        for (const r of content.staticRoutes) {
          if (!r.page.startsWith('/_')) { // Exclude system routes
            routes.add(r.page);
          }
        }
      }

      // Dynamic routes
      if (Array.isArray(content.dynamicRoutes)) {
        for (const r of content.dynamicRoutes) {
          if (!r.page.startsWith('/_')) {
            routes.add(r.page);
          }
        }
      }
    } catch (e: any) {
      // Log failure and try next
    }
  }

  // 2. Try reading app-paths-manifest.json (App Router compiled paths)
  if (await fs.pathExists(appManifestPath)) {
    manifestFound = true;
    try {
      const content = await fs.readJson(appManifestPath);
      for (const routePath of Object.keys(content)) {
        // App router manifest has formats like "/blog/[slug]/page" or "/about/page"
        if (routePath.endsWith('/page')) {
          const route = routePath.slice(0, -5) || '/';
          routes.add(route);
        } else if (routePath === '/page') {
          routes.add('/');
        }
      }
    } catch (e: any) {
      // Log failure
    }
  }

  // 3. Try reading pages-manifest.json (Pages Router compiled paths) as fallback
  if (await fs.pathExists(pagesManifestPath)) {
    manifestFound = true;
    try {
      const content = await fs.readJson(pagesManifestPath);
      for (const r of Object.keys(content)) {
        if (!r.startsWith('/_') && !r.startsWith('/api/') && r !== '/404' && r !== '/500') {
          routes.add(r);
        }
      }
    } catch (e: any) {
      // Log failure
    }
  }

  if (!manifestFound) {
    return null;
  }

  return Array.from(routes);
}

/**
 * Normalizes filesystem path elements for App Router to standard URLs.
 * e.g., /app/(marketing)/blog/[slug]/page.tsx -> /blog/[slug]
 */
export function normalizeAppRouterPath(relativePagePath: string): string | null {
  // Page path is like: "app/page.tsx" or "app/(marketing)/blog/[slug]/page.js"
  const normalized = relativePagePath.replace(/\\/g, '/');
  
  // Extract parts after "app/" and before "/page.ts/tsx/js/jsx"
  const parts = normalized.split('/');
  if (parts[0] !== 'app') return null;

  const pageIndex = parts.indexOf('page.tsx') !== -1 ? parts.indexOf('page.tsx') :
                    parts.indexOf('page.ts') !== -1 ? parts.indexOf('page.ts') :
                    parts.indexOf('page.jsx') !== -1 ? parts.indexOf('page.jsx') :
                    parts.indexOf('page.js');
  
  if (pageIndex === -1) return null;

  const routeParts = parts.slice(1, pageIndex);
  
  // If any part is a parallel route slot or private folder, invalidate the route
  const hasInvalidPart = routeParts.some(part => part.startsWith('@') || part.startsWith('_'));
  if (hasInvalidPart) return null;

  // Filter out route groups e.g. "(marketing)"
  const filteredParts = routeParts.filter(part => {
    // Route groups start with '(' and end with ')'
    if (part.startsWith('(') && part.endsWith(')')) return false;
    return true;
  });

  return '/' + filteredParts.join('/');
}

/**
 * Normalizes filesystem path elements for Pages Router to standard URLs.
 * e.g., /pages/blog/[slug].tsx -> /blog/[slug]
 */
export function normalizePagesRouterPath(relativePagePath: string): string | null {
  const normalized = relativePagePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (parts[0] !== 'pages') return null;

  // Remove pages/ prefix
  let routePath = '/' + parts.slice(1).join('/');

  // Strip extension
  const ext = path.extname(routePath);
  routePath = routePath.slice(0, -ext.length);

  // If it ends with /index, strip it
  if (routePath.endsWith('/index')) {
    routePath = routePath.slice(0, -6) || '/';
  }

  // Filter system routes and API
  if (routePath.startsWith('/_') || routePath.startsWith('/api/') || routePath === '/404' || routePath === '/500') {
    return null;
  }

  return routePath;
}

/**
 * Normalizes SvelteKit routes to standard URLs.
 * e.g., src/routes/(app)/dashboard/+page.svelte -> /dashboard
 */
export function normalizeSvelteKitPath(relativePagePath: string): string | null {
  const normalized = relativePagePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const routesIndex = parts.indexOf('routes');
  if (routesIndex === -1) return null;

  const pageIndex = parts.indexOf('+page.svelte') !== -1 ? parts.indexOf('+page.svelte') :
                    parts.indexOf('+page.ts') !== -1 ? parts.indexOf('+page.ts') :
                    parts.indexOf('+page.js');
  if (pageIndex === -1) return null;

  const routeParts = parts.slice(routesIndex + 1, pageIndex);
  
  // Filter out route groups in parentheses e.g. (app)
  const filteredParts = routeParts.filter(part => {
    if (part.startsWith('(') && part.endsWith(')')) return false;
    return true;
  });

  return '/' + filteredParts.join('/');
}

/**
 * Normalizes Astro routes to standard URLs.
 * e.g., src/pages/blog/[slug].astro -> /blog/[slug]
 */
export function normalizeAstroPath(relativePagePath: string): string | null {
  const normalized = relativePagePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const pagesIndex = parts.indexOf('pages');
  if (pagesIndex === -1) return null;

  let routePath = '/' + parts.slice(pagesIndex + 1).join('/');
  
  // Strip extension
  const ext = path.extname(routePath);
  routePath = routePath.slice(0, -ext.length);

  // Strip index suffix
  if (routePath.endsWith('/index')) {
    routePath = routePath.slice(0, -6) || '/';
  }

  return routePath;
}

/**
 * Normalizes Remix flat routes and folder-based routes.
 * e.g., app/routes/blog.$slug.tsx -> /blog/[slug]
 */
export function normalizeRemixPath(relativePagePath: string): string | null {
  const normalized = relativePagePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const routesIndex = parts.indexOf('routes');
  if (routesIndex === -1) return null;

  let routeSubpath = parts.slice(routesIndex + 1).join('/');
  const ext = path.extname(routeSubpath);
  routeSubpath = routeSubpath.slice(0, -ext.length);

  // Ignore folders like "routes/blog/route.tsx" trailing "/route"
  if (routeSubpath.endsWith('/route')) {
    routeSubpath = routeSubpath.slice(0, -6) || '_index';
  }

  const segments = routeSubpath.split('/');
  const resolvedSegments: string[] = [];

  for (const segment of segments) {
    const dotParts = segment.split('.');
    for (const part of dotParts) {
      if (part === '_index' || part === 'index') continue;
      // Skip pathless layout route folders starting with '_'
      if (part.startsWith('_')) continue;
      // Skip optional route suffixes like "route"
      if (part === 'route') continue;

      // Map dynamic parameter syntax: $slug -> [slug]
      if (part.startsWith('$')) {
        if (part === '$' || part === '$$') {
          resolvedSegments.push('[...catchall]');
        } else {
          resolvedSegments.push(`[${part.slice(1)}]`);
        }
      } else {
        resolvedSegments.push(part);
      }
    }
  }

  return '/' + resolvedSegments.join('/');
}

/**
 * Auto-detects the framework utilized by the target project.
 */
export async function detectFramework(projectDir: string): Promise<'next' | 'remix' | 'astro' | 'sveltekit' | 'static'> {
  if (await detectNextJsProject(projectDir)) {
    return 'next';
  }
  if (await fs.pathExists(path.join(projectDir, 'app/routes'))) {
    return 'remix';
  }
  if (await fs.pathExists(path.join(projectDir, 'src/routes')) || await fs.pathExists(path.join(projectDir, 'routes'))) {
    const routesDir = (await fs.pathExists(path.join(projectDir, 'src/routes'))) ? 'src/routes' : 'routes';
    const files = await globby(['**/+page.svelte'], { cwd: path.join(projectDir, routesDir) });
    if (files.length > 0) return 'sveltekit';
  }
  if (await fs.pathExists(path.join(projectDir, 'src/pages')) || await fs.pathExists(path.join(projectDir, 'pages'))) {
    const pagesDir = (await fs.pathExists(path.join(projectDir, 'src/pages'))) ? 'src/pages' : 'pages';
    const files = await globby(['**/*.astro'], { cwd: path.join(projectDir, pagesDir) });
    if (files.length > 0) return 'astro';
  }
  return 'static';
}

async function discoverSvelteKitRoutes(projectDir: string): Promise<string[]> {
  const routes = new Set<string>();
  let svelteRoutesDir = 'src/routes';
  if (!await fs.pathExists(path.join(projectDir, svelteRoutesDir))) {
    if (await fs.pathExists(path.join(projectDir, 'routes'))) {
      svelteRoutesDir = 'routes';
    } else {
      return [];
    }
  }

  const files = await globby([`${svelteRoutesDir}/**/+page.{svelte,ts,js}`], { cwd: projectDir });
  for (const file of files) {
    const route = normalizeSvelteKitPath(file);
    if (route) routes.add(route);
  }
  return Array.from(routes);
}

async function discoverAstroRoutes(projectDir: string): Promise<string[]> {
  const routes = new Set<string>();
  let astroPagesDir = 'src/pages';
  if (!await fs.pathExists(path.join(projectDir, astroPagesDir))) {
    if (await fs.pathExists(path.join(projectDir, 'pages'))) {
      astroPagesDir = 'pages';
    } else {
      return [];
    }
  }

  const files = await globby([`${astroPagesDir}/**/*.{astro,md,mdx,ts,tsx,js,jsx}`], { cwd: projectDir });
  for (const file of files) {
    const route = normalizeAstroPath(file);
    if (route) routes.add(route);
  }
  return Array.from(routes);
}

async function discoverRemixRoutes(projectDir: string): Promise<string[]> {
  const routes = new Set<string>();
  const remixRoutesDir = 'app/routes';
  if (!await fs.pathExists(path.join(projectDir, remixRoutesDir))) {
    return [];
  }

  const files = await globby([`${remixRoutesDir}/**/*.{ts,tsx,js,jsx}`], { cwd: projectDir });
  for (const file of files) {
    const route = normalizeRemixPath(file);
    if (route) routes.add(route);
  }
  return Array.from(routes);
}

/**
 * Discovers Next.js routes from filesystem scanning.
 */
async function discoverFromFileSystem(projectDir: string): Promise<string[]> {
  const routes = new Set<string>();

  // Check App Router (src/app/ or app/)
  let appDir = 'app';
  if (await fs.pathExists(path.join(projectDir, 'src', 'app'))) {
    appDir = 'src/app';
  } else if (!await fs.pathExists(path.join(projectDir, 'app'))) {
    appDir = '';
  }

  if (appDir) {
    const appFiles = await globby([`${appDir}/**/page.{ts,tsx,js,jsx}`], { cwd: projectDir });
    for (const file of appFiles) {
      const relativePath = appDir.startsWith('src/') ? file.slice(4) : file;
      const route = normalizeAppRouterPath(relativePath);
      if (route) routes.add(route);
    }
  }

  // Check Pages Router (src/pages/ or pages/)
  let pagesDir = 'pages';
  if (await fs.pathExists(path.join(projectDir, 'src', 'pages'))) {
    pagesDir = 'src/pages';
  } else if (!await fs.pathExists(path.join(projectDir, 'pages'))) {
    pagesDir = '';
  }

  if (pagesDir) {
    const pagesFiles = await globby([`${pagesDir}/**/*.{ts,tsx,js,jsx}`], { cwd: projectDir });
    for (const file of pagesFiles) {
      const relativePath = pagesDir.startsWith('src/') ? file.slice(4) : file;
      const route = normalizePagesRouterPath(relativePath);
      if (route) routes.add(route);
    }
  }

  return Array.from(routes);
}

/**
 * Interpolates dynamic parameters in discovered routes.
 * e.g., /blog/[slug] -> /blog/hello-world
 */
export function interpolateRoute(route: string, paramsMap?: Record<string, any[]>): string[] {
  // Find all parameter matches like [slug] or [...slug] or [[...slug]]
  const paramRegex = /\[(?:\[\.\.\.[a-zA-Z0-9_-]+\]|(?:\.\.\.)?[a-zA-Z0-9_-]+)\]/g;
  const matches = route.match(paramRegex);

  if (!matches) {
    return [route];
  }

  if (!paramsMap || !paramsMap[route]) {
    // No params supplied for a dynamic route. Return empty array or throw warning
    return [];
  }

  const paramValues = paramsMap[route];
  const expandedRoutes: string[] = [];

  for (const value of paramValues) {
    let tempRoute = route;

    if (Array.isArray(value)) {
      // Handle array values for catch-all params like [...slug]
      // Replace matching Catch-all parameter with values joined by '/'
      const catchAllMatch = matches.find(m => m.includes('...'));
      if (catchAllMatch) {
        tempRoute = tempRoute.replace(catchAllMatch, value.map(encodeURIComponent).join('/'));
      } else {
        // Fallback for single parameters if array passed
        const singleMatch = matches[0];
        if (singleMatch) {
          tempRoute = tempRoute.replace(singleMatch, encodeURIComponent(String(value[0])));
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      // Object parameter mapping e.g., { category: 'shoes', id: '123' }
      // Replace each [key] with value[key]
      for (const m of matches) {
        const key = m.replace(/[\[\]]/g, '').replace('...', '');
        if (key in value) {
          tempRoute = tempRoute.replace(m, encodeURIComponent(String(value[key])));
        }
      }
    } else {
      // Single primitive parameter replacement
      const firstMatch = matches[0];
      if (firstMatch) {
        // If it's a catch-all param, support primitive value
        tempRoute = tempRoute.replace(firstMatch, encodeURIComponent(String(value)));
      }
    }

    // Double check if any parameters are left unreplaced
    if (!tempRoute.match(paramRegex)) {
      expandedRoutes.push(tempRoute);
    }
  }

  return expandedRoutes;
}

/**
 * Playwright-based crawler to discover routes dynamically from a running server.
 */
async function crawlWithPlaywright(baseUrl: string, maxDepth = 3): Promise<string[]> {
  const visited = new Set<string>();
  const toVisit = new Set<string>([baseUrl]);
  const browser = await chromium.launch({ headless: true });

  try {
    for (let depth = 0; depth < maxDepth; depth++) {
      const currentList = Array.from(toVisit).filter(url => !visited.has(url));
      if (currentList.length === 0) break;

      const page = await browser.newPage();
      for (const url of currentList) {
        visited.add(url);
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
          
          // Extract all local links
          const hrefs = await page.evaluate(() => {
            const anchors = Array.from(document.querySelectorAll('a'));
            return anchors
              .map(a => a.href)
              .filter(href => href && href.startsWith(window.location.origin));
          });

          for (const href of hrefs) {
            const urlObj = new URL(href);
            // Clean up hash and query params
            const cleanUrl = `${urlObj.origin}${urlObj.pathname}`;
            if (!visited.has(cleanUrl)) {
              toVisit.add(cleanUrl);
            }
          }
        } catch {
          // Ignore page load errors during crawl
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  // Convert visited absolute URLs back to relative paths
  const baseOrigin = new URL(baseUrl).origin;
  return Array.from(visited)
    .map(url => url.substring(baseOrigin.length))
    .map(path => path === '' ? '/' : path);
}

/**
 * Main route discovery orchestrator.
 */
export async function discoverRoutes(
  projectDir: string,
  config: ParsedVitixConfig,
  options?: {
    crawlerBaseUrl?: string;
    useCrawlerOnly?: boolean;
    useFsOnly?: boolean;
  }
): Promise<RouteDiscoveryResult> {
  const configFramework = config.options?.framework || 'auto';
  let framework: 'next' | 'remix' | 'astro' | 'sveltekit' | 'static' = 'next';
  
  if (configFramework === 'auto') {
    framework = await detectFramework(projectDir);
  } else {
    framework = configFramework as any;
  }

  if (framework === 'static' && !options?.crawlerBaseUrl) {
    throw new DiscoveryError(
      'No React/Next.js, Remix, Astro, or SvelteKit project structure detected in current directory. Please run within a framework project or provide crawler settings.'
    );
  }

  // 0. If route discovery is explicitly configured as array in config
  if (Array.isArray(config.routes)) {
    // Process list and interpolate
    const expanded: string[] = [];
    for (const r of config.routes) {
      const paths = interpolateRoute(r, config.dynamicRouteParams);
      expanded.push(...paths);
    }
    return {
      routes: Array.from(new Set(expanded)),
      source: 'filesystem',
    };
  }

  // 1. Crawler Mode if requested or fallback
  if (options?.useCrawlerOnly && options.crawlerBaseUrl) {
    const routes = await crawlWithPlaywright(options.crawlerBaseUrl);
    return { routes, source: 'crawler' };
  }

  let discoveredRaw: string[] = [];
  let source: RouteDiscoveryResult['source'] = 'filesystem';

  if (framework === 'next') {
    // Next.js manifests discovery
    if (!options?.useFsOnly) {
      const buildDir = path.join(projectDir, config.build?.dir || '.next');
      const manifestRoutes = await discoverFromManifests(buildDir);
      if (manifestRoutes && manifestRoutes.length > 0) {
        discoveredRaw = manifestRoutes;
        source = 'manifests';
      }
    }
    if (discoveredRaw.length === 0) {
      discoveredRaw = await discoverFromFileSystem(projectDir);
      source = 'filesystem';
    }
  } else if (framework === 'remix') {
    discoveredRaw = await discoverRemixRoutes(projectDir);
    source = 'filesystem';
  } else if (framework === 'astro') {
    discoveredRaw = await discoverAstroRoutes(projectDir);
    source = 'filesystem';
  } else if (framework === 'sveltekit') {
    discoveredRaw = await discoverSvelteKitRoutes(projectDir);
    source = 'filesystem';
  }

  // 4. Interpolate dynamic routes
  const finalRoutes = new Set<string>();
  const assetExtensionRegex = /\.(ico|pdf|png|jpg|jpeg|gif|svg|json|xml|txt|html|webmanifest|css|js|map|woff|woff2|ttf|otf|mp4|webm|wav|mp3|ogg)$/i;

  for (const route of discoveredRaw) {
    // Skip static assets
    if (assetExtensionRegex.test(route)) {
      continue;
    }

    const isDynamic = route.includes('[') || route.includes(']');
    if (isDynamic) {
      const interpolated = interpolateRoute(route, config.dynamicRouteParams);
      if (interpolated.length > 0) {
        interpolated.forEach(r => finalRoutes.add(r));
      } else {
        // Keep the placeholder so the user sees it in the discovered list
        finalRoutes.add(route);
      }
    } else {
      finalRoutes.add(route);
    }
  }

  // Optional crawl extension if crawler is enabled in options
  if (options?.crawlerBaseUrl) {
    try {
      const crawled = await crawlWithPlaywright(options.crawlerBaseUrl);
      for (const r of crawled) {
        if (!assetExtensionRegex.test(r)) {
          finalRoutes.add(r);
        }
      }
    } catch {
      // Ignore crawl error
    }
  }

  return {
    routes: Array.from(finalRoutes),
    source,
  };
}
