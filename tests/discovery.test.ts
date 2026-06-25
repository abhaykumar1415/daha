import { describe, it, expect } from 'vitest';
import { 
  normalizeAppRouterPath, 
  normalizePagesRouterPath, 
  interpolateRoute,
  normalizeSvelteKitPath,
  normalizeAstroPath,
  normalizeRemixPath
} from '../src/discovery/index.js';

describe('Route Discovery - Path Normalization', () => {
  describe('App Router Paths', () => {
    it('should normalize standard page paths', () => {
      expect(normalizeAppRouterPath('app/page.tsx')).toBe('/');
      expect(normalizeAppRouterPath('app/about/page.tsx')).toBe('/about');
      expect(normalizeAppRouterPath('app/blog/[slug]/page.ts')).toBe('/blog/[slug]');
    });

    it('should filter out route groups', () => {
      expect(normalizeAppRouterPath('app/(marketing)/page.tsx')).toBe('/');
      expect(normalizeAppRouterPath('app/(marketing)/about/page.jsx')).toBe('/about');
      expect(normalizeAppRouterPath('app/(auth)/login/page.js')).toBe('/login');
    });

    it('should filter out parallel and private folders', () => {
      expect(normalizeAppRouterPath('app/@sidebar/page.tsx')).toBeNull();
      expect(normalizeAppRouterPath('app/blog/_components/page.tsx')).toBeNull();
      expect(normalizeAppRouterPath('app/(marketing)/@content/details/page.tsx')).toBeNull();
    });

    it('should return null for non-page files', () => {
      expect(normalizeAppRouterPath('app/layout.tsx')).toBeNull();
      expect(normalizeAppRouterPath('app/loading.tsx')).toBeNull();
      expect(normalizeAppRouterPath('app/api/route.ts')).toBeNull();
    });
  });

  describe('Pages Router Paths', () => {
    it('should normalize index and page files', () => {
      expect(normalizePagesRouterPath('pages/index.tsx')).toBe('/');
      expect(normalizePagesRouterPath('pages/about.ts')).toBe('/about');
      expect(normalizePagesRouterPath('pages/blog/index.jsx')).toBe('/blog');
      expect(normalizePagesRouterPath('pages/blog/[slug].js')).toBe('/blog/[slug]');
    });

    it('should ignore system files and api folder', () => {
      expect(normalizePagesRouterPath('pages/_app.tsx')).toBeNull();
      expect(normalizePagesRouterPath('pages/_document.tsx')).toBeNull();
      expect(normalizePagesRouterPath('pages/_error.ts')).toBeNull();
      expect(normalizePagesRouterPath('pages/api/hello.ts')).toBeNull();
      expect(normalizePagesRouterPath('pages/404.tsx')).toBeNull();
    });
  });
});

describe('Route Discovery - Parameter Interpolation', () => {
  it('should pass static routes unmodified', () => {
    const route = '/about';
    expect(interpolateRoute(route)).toEqual(['/about']);
  });

  it('should interpolate single parameters', () => {
    const route = '/blog/[slug]';
    const params = {
      '/blog/[slug]': ['hello-world', 'tech-stack-daha']
    };
    expect(interpolateRoute(route, params)).toEqual([
      '/blog/hello-world',
      '/blog/tech-stack-daha'
    ]);
  });

  it('should return empty if dynamic params are missing', () => {
    const route = '/blog/[slug]';
    expect(interpolateRoute(route, {})).toEqual([]);
    expect(interpolateRoute(route, undefined)).toEqual([]);
  });

  it('should interpolate multiple parameters in one route', () => {
    const route = '/shop/[category]/[id]';
    const params = {
      '/shop/[category]/[id]': [
        { category: 'shoes', id: '123' },
        { category: 'shirts', id: '456' }
      ]
    };
    expect(interpolateRoute(route, params)).toEqual([
      '/shop/shoes/123',
      '/shop/shirts/456'
    ]);
  });

  it('should interpolate catch-all parameters', () => {
    const route = '/docs/[...slug]';
    const params = {
      '/docs/[...slug]': [
        ['guide', 'installation'],
        ['features', 'routing', 'app-router']
      ]
    };
    expect(interpolateRoute(route, params)).toEqual([
      '/docs/guide/installation',
      '/docs/features/routing/app-router'
    ]);
  });
});

describe('Route Discovery - SvelteKit, Astro, & Remix Normalization', () => {
  describe('SvelteKit Normalizer', () => {
    it('should normalize page and endpoints', () => {
      expect(normalizeSvelteKitPath('src/routes/+page.svelte')).toBe('/');
      expect(normalizeSvelteKitPath('src/routes/about/+page.ts')).toBe('/about');
      expect(normalizeSvelteKitPath('src/routes/blog/[slug]/+page.js')).toBe('/blog/[slug]');
    });

    it('should ignore route groups in SvelteKit', () => {
      expect(normalizeSvelteKitPath('src/routes/(marketing)/about/+page.svelte')).toBe('/about');
      expect(normalizeSvelteKitPath('src/routes/(auth)/login/+page.svelte')).toBe('/login');
    });

    it('should return null for non-pages', () => {
      expect(normalizeSvelteKitPath('src/routes/+layout.svelte')).toBeNull();
      expect(normalizeSvelteKitPath('src/routes/blog/+server.ts')).toBeNull();
    });
  });

  describe('Astro Normalizer', () => {
    it('should normalize Astro pages and markdown files', () => {
      expect(normalizeAstroPath('src/pages/index.astro')).toBe('/');
      expect(normalizeAstroPath('src/pages/about.astro')).toBe('/about');
      expect(normalizeAstroPath('src/pages/blog/[slug].astro')).toBe('/blog/[slug]');
      expect(normalizeAstroPath('src/pages/docs/installation.md')).toBe('/docs/installation');
      expect(normalizeAstroPath('src/pages/feed.xml.ts')).toBe('/feed.xml');
    });

    it('should strip index suffixes in Astro pages', () => {
      expect(normalizeAstroPath('src/pages/blog/index.astro')).toBe('/blog');
    });
  });

  describe('Remix Normalizer', () => {
    it('should normalize index and flat routes', () => {
      expect(normalizeRemixPath('app/routes/_index.tsx')).toBe('/');
      expect(normalizeRemixPath('app/routes/about.tsx')).toBe('/about');
      expect(normalizeRemixPath('app/routes/blog._index.tsx')).toBe('/blog');
    });

    it('should normalize flat dynamic params', () => {
      expect(normalizeRemixPath('app/routes/blog.$slug.tsx')).toBe('/blog/[slug]');
      expect(normalizeRemixPath('app/routes/shop.$category.$id.tsx')).toBe('/shop/[category]/[id]');
    });

    it('should normalize flat layout and index paths', () => {
      expect(normalizeRemixPath('app/routes/_auth.login.tsx')).toBe('/login');
      expect(normalizeRemixPath('app/routes/dashboard.route.tsx')).toBe('/dashboard');
      expect(normalizeRemixPath('app/routes/blog/route.tsx')).toBe('/blog');
    });

    it('should normalize catch-alls in Remix', () => {
      expect(normalizeRemixPath('app/routes/$.tsx')).toBe('/[...catchall]');
    });
  });
});
