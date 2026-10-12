/* The per-letter usage counters, named. One table for the App usage rows and
   for the AI prompt export, so the two cannot label a counter differently. */
import type { PingKind } from './types';

export type Line = { kind: PingKind; L?: string; label: string };

/** The per-letter counters, as lines of rows. Each LINE is a headcount; lines must not be summed. */
export const DO_LINES: Line[] = [
  { kind: 'see', L: 'I', label: 'Opened Insights' },
  { kind: 'see', L: 'P', label: 'Opened Progress' },
  { kind: 'see', L: 'B', label: 'Tapped locked pacing' },
  { kind: 'pot', L: 'T', label: 'POTS stand test' },
  { kind: 'pot', L: 'E', label: 'POTS episode' },
  { kind: 'not', L: 'M', label: 'Turned on morning reminder' },
  { kind: 'not', L: 'C', label: 'Turned on crash warning' },
  { kind: 'not', L: 'P', label: 'Turned on pacing alerts' },
  { kind: 'rvw', label: 'Store review asked' },
];
export const LOG_LINES: Line[] = [
  { kind: 'log', L: 'S', label: 'Sleep' },
  { kind: 'log', L: 'A', label: 'Activity' },
  { kind: 'log', L: 'M', label: 'Med or supplement' },
  { kind: 'log', L: 'Y', label: 'Symptom' },
  { kind: 'log', L: 'W', label: 'Water' },
  { kind: 'log', L: 'B', label: 'Bowel movement' },
  { kind: 'log', L: 'P', label: 'Blood pressure' },
  { kind: 'log', L: 'R', label: 'Resting HR' },
  { kind: 'rdg', L: 'M', label: 'Morning baseline' },
  { kind: 'rdg', L: 'B', label: 'Later baseline' },
  { kind: 'rdg', L: 'T', label: 'Training reading' },
];
export const DIG_LINES: Line[] = [
  { kind: 'use', L: 'M', label: 'Milestones opened' },
  { kind: 'use', L: 'P', label: 'Protocol saved' },
  { kind: 'use', L: 'B', label: 'Pacing budget opened' },
  { kind: 'fnd', L: 'E', label: 'Early signal opened' },
  { kind: 'fnd', L: 'U', label: 'Unconfirmed pattern opened' },
  { kind: 'fnd', L: 'C', label: 'Biggest change opened' },
  { kind: 'fnd', L: 'R', label: 'Correlation opened' },
  { kind: 'rpt', L: 'D', label: 'Data-for-prompt report' },
  { kind: 'rpt', L: 'H', label: 'Full health report' },
  { kind: 'rpt', L: 'C', label: 'Doctor summary' },
  { kind: 'mbp', L: 'S', label: 'Morning card shown' },
  { kind: 'mbp', L: 'T', label: 'Morning card: took reading' },
  { kind: 'mbp', L: 'X', label: 'Morning card closed' },
];
