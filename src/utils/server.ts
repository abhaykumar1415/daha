import net from 'node:net';
import { execa } from 'execa';
import { ServerError } from './errors.js';
import { ParsedDahaConfig } from '../types/config.js';
import chalk from 'chalk';

/**
 * Finds an available port on localhost, starting from the given port.
 */
export async function findFreePort(startPort = 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const checkPort = () => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => {
        port++;
        if (port > 65535) {
          reject(new ServerError('No free ports available on this machine.'));
        } else {
          checkPort();
        }
      });
      server.listen(port, () => {
        server.close(() => {
          resolve(port);
        });
      });
    };
    checkPort();
  });
}

/**
 * Builds the project using the configured command.
 */
export async function buildProject(config: ParsedDahaConfig, projectDir: string, verbose = false): Promise<void> {
  const command = config.build?.command || 'npm run build';
  if (verbose) {
    console.log(chalk.dim(`Running build command: "${command}"`));
  }

  try {
    // Run build process
    const result = await execa({
      shell: true,
      cwd: projectDir,
      all: true,
    })`${command}`;

    if (result.failed) {
      throw new ServerError(`Build command failed with exit code ${result.exitCode}`);
    }
  } catch (error: any) {
    throw new ServerError(`Failed to compile the project. Error: ${error.message}\n${error.all || ''}`);
  }
}

/**
 * Represents a running server instance.
 */
export interface ServerInstance {
  port: number;
  url: string;
  shutdown: () => Promise<void>;
}

/**
 * Polls the given URL until it becomes responsive (returns 200) or times out.
 */
async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 500; // ms

  while (Date.now() - startTime < timeoutMs) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1000);

      const res = await fetch(url, { 
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'Daha-Server-Checker' }
      });
      
      clearTimeout(id);

      if (res.status >= 200 && res.status < 400) {
        return; // Server is ready
      }
    } catch {
      // Ignore network errors during polling
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new ServerError(`Server at ${url} failed to respond within ${timeoutMs}ms.`);
}

/**
 * Starts the production server and waits for it to be ready.
 */
export async function startServer(
  config: ParsedDahaConfig,
  projectDir: string,
  verbose = false
): Promise<ServerInstance> {
  // If user provided a running server URL in config, just use that
  if (config.server?.url) {
    const url = config.server.url;
    const parsedUrl = new URL(url);
    const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 80;
    
    if (verbose) {
      console.log(chalk.dim(`Using pre-existing server at ${url}`));
    }
    
    // Verify server is responsive
    await waitForServer(url, 5000);
    
    return {
      port,
      url,
      shutdown: async () => {} // Nothing to stop
    };
  }

  const startPort = config.server?.port || 3000;
  const port = await findFreePort(startPort);
  const rawCommand = config.server?.command || 'npm run start';
  
  // Interpolate {port} in start command if specified
  const command = rawCommand.replace('{port}', String(port));
  const url = `http://localhost:${port}`;

  if (verbose) {
    console.log(chalk.dim(`Starting production server on port ${port}: "${command}"`));
  }

  // Spawns the server process with the PORT environment variable
  const serverProcess = execa({
    shell: true,
    cwd: projectDir,
    env: {
      ...process.env,
      PORT: String(port),
    },
    cleanup: true,
  })`${command}`;

  let isClosed = false;
  serverProcess.on('close', (code) => {
    isClosed = true;
    if (verbose && code !== 0 && code !== null) {
      console.log(chalk.yellow(`Server process exited with code ${code}`));
    }
  });

  try {
    // Wait for the server to spin up and respond
    const timeout = config.options?.timeoutMs || 60000;
    await Promise.race([
      waitForServer(url, timeout),
      serverProcess.then(() => {
        throw new ServerError('Server process exited prematurely during startup.');
      })
    ]);

    return {
      port,
      url,
      shutdown: async () => {
        if (isClosed) return;
        
        if (verbose) {
          console.log(chalk.dim('Stopping production server...'));
        }

        // Kill the server process and its sub-processes.
        // We send SIGTERM and fall back to SIGKILL if it takes too long.
        serverProcess.kill('SIGTERM');

        const killTimeout = setTimeout(() => {
          try {
            serverProcess.kill('SIGKILL');
          } catch {}
        }, 5000);

        try {
          await serverProcess;
        } catch {
          // Ignore kill error
        } finally {
          clearTimeout(killTimeout);
        }
      }
    };
  } catch (error: any) {
    // Shutdown server process on error to avoid orphan processes
    serverProcess.kill('SIGKILL');
    throw error;
  }
}
