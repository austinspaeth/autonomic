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
};

export type PingKind =
  | 'open' | 'sub' | 'rst' | 'lap' | 'act' | 'cap' | 'hrv' | 'pay'
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
