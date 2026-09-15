/**
 * How a refused reading is described to the fault log — pure, unit-tested.
 *
 * WHY THIS EXISTS. A capture the pipeline declines to save is completely
 * invisible to us. `finishSession` fires `pingCaptureCompleted` and
 * `pingActivation` BEFORE anything judges the beats, so a user whose every
 * reading was refused reads in the dashboard as activated, with a full set of
 * completed captures, and `hrv / cap` — which we read as a completion rate —
 * counts each refusal as a completion. The review that prompted this work
 * described twenty to thirty minutes of failed attempts, and there was no
 * counter anywhere in the system that could have moved.
 *
 * WHY THE FAULT ROUTE AND NOT A PING. A ping is a counter with a fixed
 * alphabet, capped once per install per day, and the two things worth knowing
 * here are how HARD this fails and on what. `/fault` already answers exactly
 * that pair — occurrences (`n`) beside install-days (`d`), split by platform,
 * build and tier, ranked by breadth in the dashboard's Failures tab — and
 * needs no new route, no lambda change and no deploy ordering. It is also
 * called directly rather than through `logError`, which would spend the
 * once-per-install `/ping/err` counter on a placement problem and conflate a
 * bad fingertip reading with a phone worth asking for a support dump.
 *
 * WHY THE NUMBERS ARE BANDED. The message IS the signature — two reports group
 * together exactly when their redacted text matches — so a raw artifact rate
 * would file every refusal as its own bug and the ranking would be noise.
 * Banding is what turns "this phone cannot get a reading" into one row with a
 * count on it. The bands are also chosen to survive `redactMessage`, which
 * replaces any digit run of four or more: everything here is one or two digits.
 */

import { SALVAGE_MAX_ARTIFACT_PCT } from './index';

/** Artifact bands, in the units the user sees. The 15/30 edges are the camera
 *  capture gate and the salvage ceiling, so a row says which side of each
 *  decision it fell on. */
export function artifactBand(pct: number): string {
  if (!Number.isFinite(pct)) return 'unknown';
  if (pct < 5) return 'art<5';
  if (pct < 15) return 'art5-15';
  if (pct <= SALVAGE_MAX_ARTIFACT_PCT) return 'art15-30';
  if (pct <= 45) return 'art30-45';
  return 'art45+';
}

/** Coverage as a share of the attempted session. The distinction that matters
 *  is "the finger was there and noisy" versus "the pulse was barely arriving",
 *  and those live at opposite ends of this. */
export function coverageBand(coverageSec: number, durationSec: number): string {
  if (!(durationSec > 0) || !Number.isFinite(coverageSec)) return 'cov?';
  const share = Math.max(0, Math.min(1, coverageSec / durationSec));
  if (share < 0.25) return 'cov<25';
  if (share < 0.5) return 'cov25-50';
  if (share < 0.75) return 'cov50-75';
  return 'cov75+';
}

/**
 * One line describing a refusal, stable enough to group and specific enough to
 * act on: `camera noisy art15-30 cov75+`.
 *
 * `kind` names which gate refused it — the reason the user was shown — because
 * "noisy" and "thin" have different fixes and pooling them would hide whichever
 * is rarer. `nodata` is the case where nothing computed at all.
 */
export function refusalSignature(o: {
  source?: string;
  artifactPct: number;
  coverageSec: number;
  durationSec: number;
  /** Did the pipeline produce metrics at all? */
  hasFields: boolean;
}): string {
  const src = o.source || 'unknown';
  const kind = !o.hasFields
    ? 'nodata'
    : coverageBand(o.coverageSec, o.durationSec) === 'cov<25' || coverageBand(o.coverageSec, o.durationSec) === 'cov25-50'
      ? 'thin'
      : 'noisy';
  return `${src} ${kind} ${artifactBand(o.artifactPct)} ${coverageBand(o.coverageSec, o.durationSec)}`;
}
