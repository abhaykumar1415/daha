import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { discoverRoutes } from '../discovery/index.js';

export interface RoutesCommandOptions {
  config?: string;
  json?: boolean;
}

/**
 * Lists all discovered routes for the project.
 */
export async function handleRoutesCommand(options: RoutesCommandOptions): Promise<void> {
  try {
    const config = await loadConfig(options.config);
    const projectDir = process.cwd();

    const result = await discoverRoutes(projectDir, config);

    if (options.json) {
      console.log(JSON.stringify(result.routes, null, 2));
      return;
    }

    console.log('\n' + chalk.bold.cyan('=== Discovered Routes ===') + '\n');
    console.log(chalk.gray(`Source: Discovered from ${result.source}`));
    console.log(chalk.gray(`Found ${result.routes.length} route(s):\n`));

    for (const route of result.routes) {
      const isDynamicPattern = route.includes('[') || route.includes(']');
      const colorizer = isDynamicPattern ? chalk.yellow : chalk.green;
      console.log(`  ${colorizer('•')} ${route}`);
    }
    
    console.log('');
  } catch (error: any) {
    console.error(chalk.red(`\nError: ${error.message}\n`));
    process.exit(1);
  }
}
