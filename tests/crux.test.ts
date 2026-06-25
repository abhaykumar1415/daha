import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCruxMetrics } from '../src/rum/crux.js';

describe('Chrome UX Report (CrUX) API Fetcher', () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should successfully parse metric percentiles (p75) from valid Google CrUX API response', async () => {
    const mockApiResponse = {
      record: {
        metrics: {
          first_contentful_paint: {
            percentiles: { p75: 1200 }
          },
          largest_contentful_paint: {
            percentiles: { p75: 2200 }
          },
          cumulative_layout_shift: {
            percentiles: { p75: '0.04' }
          },
          interaction_to_next_paint: {
            percentiles: { p75: 180 }
          }
        }
      }
    };

    fetchMock.mockImplementation(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockApiResponse),
    }));

    const result = await fetchCruxMetrics('https://nextjs.org', 'fake-api-key', 'mobile');
    
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, reqOptions] = fetchMock.mock.calls[0];
    expect(endpoint).toBe('https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=fake-api-key');
    expect(JSON.parse(reqOptions.body)).toEqual({
      url: 'https://nextjs.org',
      formFactor: 'PHONE'
    });

    expect(result).toEqual({
      FCP: 1200,
      LCP: 2200,
      CLS: 0.04,
      INP: 180
    });
  });

  it('should map desktop preset to DESKTOP form factor', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ record: { metrics: {} } }),
    }));

    await fetchCruxMetrics('https://nextjs.org', 'fake-api-key', 'desktop');
    
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.formFactor).toBe('DESKTOP');
  });

  it('should return null when CrUX endpoint returns 404 (insufficient traffic)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    }));

    const result = await fetchCruxMetrics('https://low-traffic-site.com', 'fake-api-key', 'mobile');
    expect(result).toBeNull();
  });

  it('should fail silently and return null on network or parser crash', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('Network error')));

    const result = await fetchCruxMetrics('https://nextjs.org', 'fake-api-key', 'mobile');
    expect(result).toBeNull();
  });
});
