export interface CruxMetrics {
  FCP: number;
  LCP: number;
  CLS: number;
  INP: number;
}

export async function fetchCruxMetrics(url: string, apiKey: string, preset: 'mobile' | 'desktop' = 'mobile'): Promise<CruxMetrics | null> {
  const formFactor = preset === 'desktop' ? 'DESKTOP' : 'PHONE';
  const apiEndpoint = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${apiKey}`;

  const payload = {
    url,
    formFactor,
  };

  try {
    const res = await globalThis.fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // 404 indicates the page is not in the CrUX dataset (insufficient traffic)
      return null;
    }

    const data = await res.json();
    const metrics = data?.record?.metrics;

    if (!metrics) return null;

    const parseMetric = (metricObj: any): number => {
      const val = metricObj?.percentiles?.p75;
      if (val === undefined || val === null) return 0;
      return typeof val === 'string' ? parseFloat(val) : val;
    };

    return {
      FCP: parseMetric(metrics.first_contentful_paint),
      LCP: parseMetric(metrics.largest_contentful_paint),
      CLS: parseMetric(metrics.cumulative_layout_shift),
      INP: parseMetric(metrics.interaction_to_next_paint),
    };
  } catch {
    // Fail silently and return null
    return null;
  }
}
