/**
 * Apple HealthKit wrapper (iOS only). Read: resting/walking HR, HRV SDNN,
 * respiratory rate, SpO2, blood pressure, body mass, sleep, and beat-to-beat
 * data. Write: HRV SDNN, resting/avg HR, a Mindfulness session, weight, BP, SpO2.
 *
 * Guarded so importing on Android or without the native module returns a stub
 * with `available: false`. The module is loaded lazily.
 */
import { Platform } from 'react-native';

export interface HealthApi {
  available: boolean;
  requestAuth(): Promise<boolean>;
  /** Pull the day's relevant samples for a YYYY-MM-DD key. */
  readDay(dk: string): Promise<HealthDaySamples>;
  writeHrvSession(opts: { sdnnMs: number; avgHr: number; startISO: string; durationSec: number }): Promise<void>;
  writeQuantity(kind: 'weight' | 'spo2' | 'systolic' | 'diastolic', value: number, dateISO: string): Promise<void>;
}

export interface HealthDaySamples {
  restingHr: number | null;
  hrvSdnn: number | null;
  spo2: number | null; // fraction 0..1 or percent depending on source; normalized to percent
  systolic: number | null;
  diastolic: number | null;
  respiratoryRate: number | null;
  weightLb: number | null;
  sleep: { bed?: string; wake?: string; interrupted?: boolean } | null;
}

const emptyDay: HealthDaySamples = {
  restingHr: null, hrvSdnn: null, spo2: null, systolic: null, diastolic: null,
  respiratoryRate: null, weightLb: null, sleep: null,
};

const stub: HealthApi = {
  available: false,
  async requestAuth() { return false; },
  async readDay() { return emptyDay; },
  async writeHrvSession() { /* no-op */ },
  async writeQuantity() { /* no-op */ },
};

let cached: HealthApi | null = null;

export function health(): HealthApi {
  if (cached) return cached;
  if (Platform.OS !== 'ios') { cached = stub; return cached; }
  let hk: typeof import('@kingstinct/react-native-healthkit');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    hk = require('@kingstinct/react-native-healthkit');
  } catch {
    cached = stub;
    return cached;
  }
  const mod = (hk as { default?: unknown }).default ?? hk;
  cached = makeReal(mod as HkModule);
  return cached;
}

/** Loosely-typed surface over the healthkit module (its API varies by version). */
interface HkModule {
  isHealthDataAvailable?: () => Promise<boolean>;
  requestAuthorization?: (share: string[], read: string[]) => Promise<boolean>;
  queryQuantitySamples?: (id: string, opts: Record<string, unknown>) => Promise<{ quantity: number; startDate: string; endDate: string }[]>;
  queryCategorySamples?: (id: string, opts: Record<string, unknown>) => Promise<{ value: number; startDate: string; endDate: string }[]>;
  saveQuantitySample?: (id: string, unit: string, value: number, opts?: Record<string, unknown>) => Promise<boolean>;
  saveCategorySample?: (id: string, value: number, opts?: Record<string, unknown>) => Promise<boolean>;
}

const READ_IDS = [
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRespiratoryRate',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierBloodPressureSystolic',
  'HKQuantityTypeIdentifierBloodPressureDiastolic',
  'HKQuantityTypeIdentifierBodyMass',
  'HKCategoryTypeIdentifierSleepAnalysis',
];
const WRITE_IDS = [
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierBloodPressureSystolic',
  'HKQuantityTypeIdentifierBloodPressureDiastolic',
  'HKCategoryTypeIdentifierMindfulSession',
];

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function makeReal(mod: HkModule): HealthApi {
  const dayBounds = (dk: string) => {
    const [y, m, d] = dk.split('-').map(Number);
    const from = new Date(y, m - 1, d, 0, 0, 0);
    const to = new Date(y, m - 1, d, 23, 59, 59);
    return { from: from.toISOString(), to: to.toISOString() };
  };
  const avgQ = async (id: string, dk: string): Promise<number | null> => {
    try {
      const { from, to } = dayBounds(dk);
      const rows = (await mod.queryQuantitySamples?.(id, { from, to, limit: 200 })) || [];
      if (!rows.length) return null;
      return rows.reduce((s, r) => s + r.quantity, 0) / rows.length;
    } catch { return null; }
  };
  return {
    available: true,
    async requestAuth() {
      try {
        if (mod.isHealthDataAvailable && !(await mod.isHealthDataAvailable())) return false;
        return (await mod.requestAuthorization?.(WRITE_IDS, READ_IDS)) ?? false;
      } catch { return false; }
    },
    async readDay(dk) {
      const [restingHr, hrvSdnn, respiratoryRate, spo2raw, systolic, diastolic, weightKg] = await Promise.all([
        avgQ('HKQuantityTypeIdentifierRestingHeartRate', dk),
        avgQ('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', dk),
        avgQ('HKQuantityTypeIdentifierRespiratoryRate', dk),
        avgQ('HKQuantityTypeIdentifierOxygenSaturation', dk),
        avgQ('HKQuantityTypeIdentifierBloodPressureSystolic', dk),
        avgQ('HKQuantityTypeIdentifierBloodPressureDiastolic', dk),
        avgQ('HKQuantityTypeIdentifierBodyMass', dk),
      ]);
      let sleep: HealthDaySamples['sleep'] = null;
      try {
        const { from, to } = dayBounds(dk);
        const rows = (await mod.queryCategorySamples?.('HKCategoryTypeIdentifierSleepAnalysis', { from, to, limit: 100 })) || [];
        const asleep = rows.filter((r) => r.value === 1 || r.value >= 3);
        if (asleep.length) {
          const bed = asleep.reduce((a, b) => (a.startDate < b.startDate ? a : b));
          const wake = asleep.reduce((a, b) => (a.endDate > b.endDate ? a : b));
          sleep = { bed: hhmm(bed.startDate), wake: hhmm(wake.endDate), interrupted: asleep.length > 3 };
        }
      } catch { /* ignore */ }
      const spo2 = spo2raw == null ? null : spo2raw <= 1 ? spo2raw * 100 : spo2raw;
      return {
        restingHr: restingHr != null ? Math.round(restingHr) : null,
        hrvSdnn: hrvSdnn != null ? Math.round(hrvSdnn) : null,
        respiratoryRate,
        spo2: spo2 != null ? Math.round(spo2) : null,
        systolic: systolic != null ? Math.round(systolic) : null,
        diastolic: diastolic != null ? Math.round(diastolic) : null,
        weightLb: weightKg != null ? Math.round(weightKg * 2.20462) : null,
        sleep,
      };
    },
    async writeHrvSession({ sdnnMs, avgHr, startISO, durationSec }) {
      const end = new Date(new Date(startISO).getTime() + durationSec * 1000).toISOString();
      try {
        await mod.saveQuantitySample?.('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms', sdnnMs, { start: startISO, end });
        await mod.saveQuantitySample?.('HKQuantityTypeIdentifierRestingHeartRate', 'count/min', avgHr, { start: startISO, end });
        await mod.saveCategorySample?.('HKCategoryTypeIdentifierMindfulSession', 0, { start: startISO, end });
      } catch { /* graceful */ }
    },
    async writeQuantity(kind, value, dateISO) {
      const map: Record<string, [string, string]> = {
        weight: ['HKQuantityTypeIdentifierBodyMass', 'lb'],
        spo2: ['HKQuantityTypeIdentifierOxygenSaturation', '%'],
        systolic: ['HKQuantityTypeIdentifierBloodPressureSystolic', 'mmHg'],
        diastolic: ['HKQuantityTypeIdentifierBloodPressureDiastolic', 'mmHg'],
      };
      const [id, unit] = map[kind];
      const v = kind === 'spo2' ? value / 100 : value;
      try { await mod.saveQuantitySample?.(id, unit, v, { start: dateISO, end: dateISO }); } catch { /* graceful */ }
    },
  };
}
