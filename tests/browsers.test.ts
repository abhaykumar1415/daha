import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import {
  isChromiumInstalled,
  getChromiumExecutablePath,
  ensureChromiumReady,
  isChromiumUsable,
} from '../src/utils/browsers.js';

const launchMock = vi.fn();

vi.mock('playwright', () => ({
  chromium: {
    executablePath: () => '/tmp/fake-playwright-chromium/chrome',
    launch: (...args: unknown[]) => launchMock(...args),
  },
}));

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

describe('browsers utilities', () => {
  beforeEach(() => {
    launchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports Chromium as installed when the executable exists', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    expect(isChromiumInstalled()).toBe(true);
    expect(getChromiumExecutablePath()).toBe('/tmp/fake-playwright-chromium/chrome');
  });

  it('reports Chromium as missing when the executable does not exist', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(isChromiumInstalled()).toBe(false);
  });

  it('isChromiumUsable falls back to a launch probe when the path is missing', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    launchMock.mockResolvedValue({ close: vi.fn().mockResolvedValue(undefined) });
    expect(await isChromiumUsable()).toBe(true);
  });

  it('ensureChromiumReady is a no-op when Chromium is already usable', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    await expect(ensureChromiumReady()).resolves.toBeUndefined();
  });

  it('ensureChromiumReady throws when missing and autoInstall is disabled', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    launchMock.mockRejectedValue(new Error("Executable doesn't exist"));
    await expect(ensureChromiumReady({ autoInstall: false })).rejects.toThrow(
      /Playwright Chromium is required/
    );
  });
});
