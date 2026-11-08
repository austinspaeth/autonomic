import { requireNativeModule } from 'expo-modules-core';
import type { RawEcgSample } from '../../src/lib/health/ecgMetrics';

export type { RawEcgSample };

/** One dose the person logged as TAKEN in the Health app's medication list
 *  (iOS 26+). `dose`/`unit` are the amount as recorded; `dose` is absent when
 *  no amount was, which is not the same as zero. */
export interface RawMedicationDose {
  uuid: string;
  start: number;            // epoch ms the dose was taken
  end: number;
  name: string;             // the medication's own name ("Ivabradine")
  nickname: string;         // the person's name for it, or ''
  form: string;             // HKMedicationGeneralForm raw value ('tablet', …)
  archived: boolean;        // archived in the Health app's list
  scheduled: boolean;       // logged from a reminder, not ad-hoc
  unit: string;             // HKUnit string ('mg', 'count', …)
  bundleId: string;
  sourceName: string;
  dose?: number;
  scheduledDose?: number;
  scheduledAt?: number;
}

/**
 * What the medication picker answered. `ok` is Apple's `success`, which says
 * the request was PROCESSED and never what was shared; `code` is the reason,
 * one stable word (see the Swift `hkCode`), because most not-successes arrive
 * as a HealthKit error and two of them ('canceled', 'nodata') are not faults
 * at all.
 */
export interface MedicationAuthResult {
  ok: boolean;
  code: string;
  message?: string;
}

interface EcgHealthNative {
  isAvailable(): Promise<boolean>;
  requestAuthorization(): Promise<boolean>;
  queryEcg(sinceMs: number, limit: number): Promise<RawEcgSample[]>;
  /** Delete the category samples of one type THIS APP saved in a window.
   *  Optional: binaries built before 1.38 do not carry it. */
  deleteOwnCategory?(typeIdentifier: string, startMs: number, endMs: number): Promise<boolean>;
  /** Does this OS have a medication log to read? iOS 26+. Optional: binaries
   *  built before 1.39 do not carry any of the three below. */
  medicationsAvailable?(): Promise<boolean>;
  /** READ authorization for dose events + the medication list. Its own sheet,
   *  asked only from a tap. Resolves the structured answer; the `boolean` arm
   *  is what a binary built before this shipped resolves, and the JS reads it
   *  as ok/failed (../../src/lib/health/medPicker.ts). */
  requestMedicationAuth?(): Promise<MedicationAuthResult | boolean>;
  /** Doses logged as taken inside [startMs, endMs). */
  queryMedications?(startMs: number, endMs: number, limit: number): Promise<RawMedicationDose[]>;
}

let mod: EcgHealthNative | null | undefined;

/** The native module, or null when it isn't built in (non-iOS / Expo Go). */
export function ecgNative(): EcgHealthNative | null {
  if (mod !== undefined) return mod;
  try {
    mod = requireNativeModule('EcgHealth') as EcgHealthNative;
  } catch {
    mod = null;
  }
  return mod;
}
