import path from 'node:path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { ParsedVitixConfig, VitixConfigSchema } from '../types/config.js';
import { ConfigError } from '../utils/errors.js';
import esbuild from 'esbuild';

const DEFAULT_CONFIG_FILES = [
  'vitix.config.ts',
  'vitix.config.js',
  'vitix.config.mjs',
  '.vitixrc.yml',
  '.vitixrc.yaml',
  '.vitixrc.json',
];

/**
 * Dynamically loads and transpiles a TypeScript file using esbuild.
 */
export async function loadTsFile(filePath: string): Promise<any> {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new ConfigError(`Config file not found at ${absolutePath}`);
  }

  // Create a temporary file in node_modules or temp dir
  const tempDir = path.join(process.cwd(), 'node_modules', '.vitix-cache');
  await fs.ensureDir(tempDir);
  const tempFile = path.join(tempDir, `config-${Date.now()}.mjs`);

  try {
    await esbuild.build({
      entryPoints: [absolutePath],
      bundle: true,
      outfile: tempFile,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      logLevel: 'silent',
      // Mark node modules as external in config bundler to prevent bundling them
      external: ['*'],
    });

    const moduleUrl = `file://${tempFile.replace(/\\/g, '/')}`;
    const imported = await import(moduleUrl);
    
    // Support both default export and direct export
    return imported.default || imported;
  } catch (error: any) {
    throw new ConfigError(`Failed to parse TypeScript config file: ${error.message}`);
  } finally {
    // Graceful cleanup of temporary file
    try {
      await fs.remove(tempFile);
    } catch {
      // Ignore cleanup error
    }
  }
}

/**
 * Loads a configuration file from a specified path or defaults.
 */
export async function loadConfig(configPath?: string): Promise<ParsedVitixConfig> {
  let foundPath: string | null = null;

  if (configPath) {
    const absolutePath = path.resolve(configPath);
    if (await fs.pathExists(absolutePath)) {
      foundPath = absolutePath;
    } else {
      throw new ConfigError(`Specified config file not found at: ${configPath}`);
    }
  } else {
    // Search default locations
    for (const file of DEFAULT_CONFIG_FILES) {
      const absolutePath = path.join(process.cwd(), file);
      if (await fs.pathExists(absolutePath)) {
        foundPath = absolutePath;
        break;
      }
    }
  }

  // If no config found, return defaults
  if (!foundPath) {
    return VitixConfigSchema.parse({});
  }

  const ext = path.extname(foundPath).toLowerCase();
  let rawConfig: any = {};

  try {
    if (ext === '.ts') {
      rawConfig = await loadTsFile(foundPath);
    } else if (ext === '.js' || ext === '.mjs') {
      const moduleUrl = `file://${foundPath.replace(/\\/g, '/')}`;
      const imported = await import(moduleUrl);
      rawConfig = imported.default || imported;
    } else if (ext === '.json') {
      rawConfig = await fs.readJson(foundPath);
    } else if (ext === '.yml' || ext === '.yaml') {
      const content = await fs.readFile(foundPath, 'utf8');
      rawConfig = yaml.load(content);
    } else {
      throw new ConfigError(`Unsupported config file format: ${ext}`);
    }
  } catch (error: any) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError(`Failed to load config file at ${foundPath}: ${error.message}`);
  }

  // Validate loaded config with Zod
  const validation = VitixConfigSchema.safeParse(rawConfig);
  if (!validation.success) {
    const errorDetails = validation.error.errors
      .map(err => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new ConfigError(`Invalid configuration in ${foundPath}:\n${errorDetails}`);
  }

  return validation.data;
}
