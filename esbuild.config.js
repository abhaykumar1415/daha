import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

const external = [
  ...builtinModules,
  ...builtinModules.map(m => `node:${m}`),
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
];

try {
  // 1. Build CLI binary
  await esbuild.build({
    entryPoints: ['src/bin.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: 'dist/bin.js',
    banner: {
      js: '#!/usr/bin/env node',
    },
    external,
    sourcemap: true,
    minify: false,
  });

  // Make the CLI output file executable
  const binPath = path.resolve('dist/bin.js');
  fs.chmodSync(binPath, 0o755);

  // 2. Build Library package
  await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: 'dist/index.js',
    external,
    sourcemap: true,
    minify: false,
  });

  console.log('Build completed successfully.');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
