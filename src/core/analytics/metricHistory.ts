// Ported from legacy docs/index.html metricHistory (~lines 3284-3292).
// Decoupled: legacy read the module-global state.days; here `days` and the
// `extractor` are passed in as parameters.

import type { Day, Reading } from '@core/types';

export interface MetricPoint {
  v: number;
  date: string;
}

export function metricHistory(
  days: Record<string, Day>,
  type: string,
  extractor: (r: Reading) => number | null | undefined,
  limit = 15,
): MetricPoint[] {
  const out: MetricPoint[] = [];
  Object.keys(days)
    .sort()
    .forEach((dk) => {
      const list = (days[dk].readings || []).filter((r) => r.type === type);
      list.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      list.forEach((r) => {
        const v = extractor(r);
        if (v != null && !isNaN(v)) out.push({ v, date: dk });
      });
    });
  return out.slice(-limit);
}
