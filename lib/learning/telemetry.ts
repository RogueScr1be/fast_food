type TelemetryAttrs = Record<string, string | number | boolean | null | undefined>;

const counters = new Map<string, number>();

function formatAttrs(attrs?: TelemetryAttrs): string {
  if (!attrs) return '';
  const pairs = Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);
  return pairs.length > 0 ? ` ${pairs.join(' ')}` : '';
}

export function incrementLearningMetric(
  name: string,
  delta = 1,
  attrs?: TelemetryAttrs,
): number {
  const previous = counters.get(name) ?? 0;
  const next = previous + delta;
  counters.set(name, next);
  console.log(`[learning-metric] name=${name} value=${next}${formatAttrs(attrs)}`);
  return next;
}

export function setLearningMetricGauge(
  name: string,
  value: number,
  attrs?: TelemetryAttrs,
): number {
  counters.set(name, value);
  console.log(`[learning-metric] name=${name} value=${value}${formatAttrs(attrs)}`);
  return value;
}

export function getLearningMetricSnapshot(): Record<string, number> {
  const snapshot: Record<string, number> = {};
  for (const [name, value] of counters.entries()) {
    snapshot[name] = value;
  }
  return snapshot;
}
