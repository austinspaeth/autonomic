/* Shapes returned by sls/lambdas/api/main.js (LOAD, STORE_VERSIONS) and
   sls/lambdas/ping/main.js (PINGS). Only the fields this app reads. */

export type Platform = 'ios' | 'android';

export type Entry = {
  date: string;
  platform: Platform;
  downloads?: number;
  impressions?: number;
  pageViews?: number;
  updates?: number;
  notes?: string;
};

export type Sale = {
  id: string;
  date: string;
  platform: Platform;
  plan: 'monthly' | 'annual' | 'lifetime' | 'unknown';
  price: number;
  qty: number;
  cohort?: string;
  cancelled?: string;
  refunded?: boolean;
  note?: string;
  /** The subscribe ping this purchase was recorded from: `<arrival day>|<cohort key>`. */
  ping?: string;
};

export type Churn = { id: string; date: string; mrr: number; plan?: 'monthly' | 'annual' | 'unknown'; platform?: Platform; units?: number; note?: string };

export type Cost = {
  id: string;
  date: string;
  amount: number;
  category: string;
  label?: string;
  capex?: boolean;
  recurrence?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  until?: string;
};

export type DashEvent = {
  id: string;
  date: string;
  category: 'RELEASE' | 'MARKETING' | 'STORE' | 'EXTERNAL';
  title: string;
  note?: string;
};

export type Settings = { trialDays: number; wallDays: number; currency: string; storeCutPct: number };

export type CampaignLink = {
  slug: string;
  label?: string;
  ios?: string;
  android?: string;
  web?: string;
  note?: string;
  created?: string;
};

export type LoadResponse = {
  links?: CampaignLink[];
  entries: Entry[];
  events: DashEvent[];
  costs: Cost[];
  sales: Sale[];
  churn: Churn[];
  settings: Settings;
};

/** Platform letter on a ping: I iOS, A Android, U unknown. */
export type PingPlatform = 'I' | 'A' | 'U';

export type PingCohort = {
  key: string;
  cohort: string; // ISO install day
  platform: PingPlatform;
  slot: string | null; // sensor / surface / plan letter, depending on the route
  tier: 'F' | 'T' | 'P' | null;
  count: number;
};

export type PingBuild = { key: string; platform: PingPlatform; tier: 'F' | 'T' | 'P' | null; version: string | null; count: number };

export type PingRow = {
  day: string;
  total: number;
  cohorts: PingCohort[];
  /** Per app version (open rows carry them). */
  builds?: PingBuild[];
  /** sub rows only: how each purchase was known, V verified / S store-only. */
  evidence?: { key: string; evidence: 'V' | 'S'; count: number }[];
  /** sub rows only: the door each sale came through, a wall letter (the `pay`
   *  route's) or an offer card (A annual, F founder), joinable on the cohort
   *  key. A sale with no door here is not known, never a door of its own. */
  doors?: { key: string; door: string; count: number }[];
  /** open rows only: when each open arrived, `{ "14I": n, "09AN": n }` (Eastern
   *  hour, store, `N` for a first run). Absent before the server counted it. */
  hours?: Record<string, number>;
  /** sub rows only: when the latest sale under each cohort key arrived (ISO).
   *  Absent before the server kept it. */
  times?: Record<string, string>;
};

export type Fault = {
  key: string;
  day: string;
  tag: string;
  msg: string;
  fatal: boolean;
  occurrences: number;
  installs: number;
  platforms: Record<string, number>;
  versions: Record<string, number>;
  occPlatforms?: Record<string, number>;
  /** When the first and the latest report for this failure on this day arrived (ISO). */
  firstAt?: string | null;
  lastAt?: string | null;
};

export type PingKind =
  | 'open' | 'sub' | 'rst' | 'lap' | 'act' | 'cap' | 'hrv' | 'sav' | 'pay'
  | 'not' | 'pot' | 'see' | 'err' | 'osh' | 'odm' | 'oac' | 'ofl'
  | 'log' | 'use' | 'fnd' | 'rpt' | 'rdg' | 'mbp' | 'rvw';

export type PingReport = { since: string; faults: Fault[] } & Partial<Record<PingKind, PingRow[]>>;

export type StoreSide = {
  version?: string | null;
  released?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  url?: string | null;
  error?: string;
  detail?: string;
};

export type StoreVersions = { at?: string; ios?: StoreSide; android?: StoreSide; cached?: boolean };

/** An access code: days of full access handed to one person, redeemed in the app once. */
export type AccessCode = {
  code: string;
  days: number;
  note: string;
  createdAt: string | null;
  /** A code works once: true from the moment the app was told it is good. */
  used: boolean;
  redeemedAt: string | null;
  redeemedPlatform: string | null;
  redeemedVersion: string | null;
};
