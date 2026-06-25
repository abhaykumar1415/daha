import { AuditResult, ParsedDahaConfig, RouteAuditSummary } from '../types/config.js';
import { CoreWebVitalKey, LighthouseCategory } from '../types/config.js';

/**
 * Calculates the median run from a list of runs.
 * Sorts runs by performance score and picks the middle one.
 */
export function getMedianRun(runs: AuditResult[]): AuditResult {
  if (runs.length === 0) {
    throw new Error('Cannot calculate median of empty runs list');
  }

  // Sort by performance score ascending
  const sorted = [...runs].sort((a, b) => a.scores.performance - b.scores.performance);
  
  // Pick the median
  const medianIndex = Math.floor(sorted.length / 2);
  return sorted[medianIndex];
}

/**
 * Computes average category scores and web vitals metrics across all runs.
 */
export function calculateAverages(runs: AuditResult[]): {
  scores: Record<LighthouseCategory, number>;
  metrics: Record<CoreWebVitalKey, number>;
} {
  const count = runs.length;
  if (count === 0) {
    throw new Error('Cannot calculate averages of empty runs list');
  }

  const sumScores: Record<LighthouseCategory, number> = {
    performance: 0,
    accessibility: 0,
    'best-practices': 0,
    seo: 0,
  };

  const sumMetrics: Record<CoreWebVitalKey, number> = {
    FCP: 0,
    LCP: 0,
    CLS: 0,
    FID: 0,
    INP: 0,
    TBT: 0,
    TTFB: 0,
  };

  for (const run of runs) {
    for (const cat of Object.keys(sumScores) as LighthouseCategory[]) {
      sumScores[cat] += run.scores[cat];
    }
    for (const metric of Object.keys(sumMetrics) as CoreWebVitalKey[]) {
      sumMetrics[metric] += run.metrics[metric];
    }
  }

  const averageScores: Record<LighthouseCategory, number> = {} as any;
  const averageMetrics: Record<CoreWebVitalKey, number> = {} as any;

  for (const cat of Object.keys(sumScores) as LighthouseCategory[]) {
    averageScores[cat] = Math.round(sumScores[cat] / count);
  }
  for (const metric of Object.keys(sumMetrics) as CoreWebVitalKey[]) {
    // Round to 2 decimal places for CLS, and round to integer for time-based metrics (ms)
    if (metric === 'CLS') {
      averageMetrics[metric] = Math.round((sumMetrics[metric] / count) * 100) / 100;
    } else {
      averageMetrics[metric] = Math.round(sumMetrics[metric] / count);
    }
  }

  return {
    scores: averageScores,
    metrics: averageMetrics,
  };
}

/**
 * Analyzes a route's runs against configuration thresholds.
 */
export function analyzeRouteRuns(
  route: string,
  url: string,
  runs: AuditResult[],
  config: ParsedDahaConfig
): RouteAuditSummary {
  const medianRun = getMedianRun(runs);
  const averages = calculateAverages(runs);
  const violations: string[] = [];

  const thresholds = config.thresholds || {};

  // 1. Check Category Thresholds
  if (thresholds.categories) {
    for (const [category, minScore] of Object.entries(thresholds.categories)) {
      const catKey = category as LighthouseCategory;
      const actualScore = medianRun.scores[catKey];
      if (actualScore < minScore) {
        violations.push(
          `Category "${category}" score of ${actualScore} is below threshold of ${minScore}.`
        );
      }
    }
  }

  // 2. Check Overall Score Threshold (checks Performance score by default)
  if (thresholds.overallScore !== undefined) {
    const actualPerformance = medianRun.scores.performance;
    if (actualPerformance < thresholds.overallScore) {
      violations.push(
        `Overall performance score of ${actualPerformance} is below threshold of ${thresholds.overallScore}.`
      );
    }
  }

  // 3. Check Metric Thresholds
  if (thresholds.metrics) {
    for (const [metric, threshold] of Object.entries(thresholds.metrics)) {
      const metricKey = metric as CoreWebVitalKey;
      const actualValue = medianRun.metrics[metricKey];

      if (threshold.min !== undefined && actualValue < threshold.min) {
        violations.push(
          `Metric "${metric}" value of ${actualValue} is below minimum threshold of ${threshold.min}.`
        );
      }

      if (threshold.max !== undefined && actualValue > threshold.max) {
        const unit = metricKey === 'CLS' ? '' : 'ms';
        violations.push(
          `Metric "${metric}" value of ${actualValue}${unit} exceeds maximum threshold of ${threshold.max}${unit}.`
        );
      }
    }
  }

  // 4. Check Resource Budgets
  if (thresholds.budgets && medianRun.resources) {
    const budgets = thresholds.budgets;
    const resources = medianRun.resources;

    if (budgets.maxTotalJsSizeKb !== undefined && resources.totalJsSizeKb > budgets.maxTotalJsSizeKb) {
      violations.push(
        `Total JS bundle size of ${resources.totalJsSizeKb}KB exceeds the budget limit of ${budgets.maxTotalJsSizeKb}KB.`
      );
    }
    if (budgets.maxTotalCssSizeKb !== undefined && resources.totalCssSizeKb > budgets.maxTotalCssSizeKb) {
      violations.push(
        `Total CSS bundle size of ${resources.totalCssSizeKb}KB exceeds the budget limit of ${budgets.maxTotalCssSizeKb}KB.`
      );
    }
    if (budgets.maxTotalImageSizeKb !== undefined && resources.totalImageSizeKb > budgets.maxTotalImageSizeKb) {
      violations.push(
        `Total images transfer size of ${resources.totalImageSizeKb}KB exceeds the budget limit of ${budgets.maxTotalImageSizeKb}KB.`
      );
    }
    if (budgets.maxThirdPartyRequests !== undefined && resources.thirdPartyRequests > budgets.maxThirdPartyRequests) {
      violations.push(
        `Total third-party requests count of ${resources.thirdPartyRequests} exceeds the budget limit of ${budgets.maxThirdPartyRequests}.`
      );
    }
  }

  return {
    route,
    url,
    preset: medianRun.preset,
    runs,
    medianRun,
    averageScores: averages.scores,
    averageMetrics: averages.metrics,
    passed: violations.length === 0,
    violations,
  };
}
