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
 * How much pulse was COLLECTED, as a share of the session — before triage threw
 * any of it away. Beside {@link coverageBand} it is the whole diagnosis of a
 * no-data refusal: `cov<25 raw50+` is a finger that was on the lens and kept
 * losing the lock (minutes of pulse, every stretch too short to keep), while
 * `cov<25 raw<25` is a pulse that was never arriving. Those are different
 * problems with different fixes, and `cov<25` alone reported them as one row.
 */
export function rawBand(rawSec: number, durationSec: number): string {
  if (!(durationSec > 0) || !Number.isFinite(rawSec)) return 'raw?';
  const share = Math.max(0, rawSec / durationSec);
  if (share < 0.25) return 'raw<25';
  if (share < 0.5) return 'raw25-50';
  return 'raw50+';
}

/** How many separate stretches of pulse the reading was collected in. One is a
 *  continuous reading; five or more is a lock that would not hold. */
export function segmentBand(n: number): string {
  if (!Number.isFinite(n) || n < 1) return 'seg0';
  if (n === 1) return 'seg1';
  if (n <= 4) return 'seg2-4';
  return 'seg5+';
}

/** How long the session ran. Tells a reading that went the distance apart from
 *  one ended early by hand, which `cov` (a share of whatever ran) cannot. */
export function durationBand(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return 'dur?';
  if (sec < 60) return 'dur<1m';
  if (sec < 240) return 'dur1-4m';
  return 'dur4m+';
}

/** Paced breathing or not. Carried because a paced reading swings the pulse
 *  harder, and whether that costs the camera its lock is a question the log
 *  could not otherwise be asked. */
export const paceToken = (kind: string | undefined) => (kind === 'breath' ? 'paced' : 'free');

/** The tokens every capture report shares, in one order, so a consumer parses
 *  one shape. Absent inputs are simply left out — a caller that knows less says
 *  less, never a guess. */
function shapeTokens(o: { rawSec?: number; segments?: number; durationSec: number; kind?: string }): string {
  const out: string[] = [];
  if (o.rawSec !== undefined) out.push(rawBand(o.rawSec, o.durationSec));
  if (o.segments !== undefined) out.push(segmentBand(o.segments));
  if (o.rawSec !== undefined || o.segments !== undefined) out.push(durationBand(o.durationSec));
  if (o.kind !== undefined) out.push(paceToken(o.kind));
  return out.length ? ` ${out.join(' ')}` : '';
}

/**
 * One line describing a refusal, stable enough to group and specific enough to
 * act on: `camera noisy art15-30 cov75+ raw50+ seg1 dur4m+ free`.
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
  /**
   * Beats the artifact rate was computed OVER — `rrClean.length`. Zero means
   * there is no rate to report, and the band has to say so.
   *
   * `computeHrv` sets `artifactPct = clean.length ? flagged / clean.length : 0`,
   * so a reading that kept no beats arrives here claiming a 0% artifact rate
   * and bands as `art<5` — the cleanest band there is, on a reading with no
   * signal in it at all. That is not a small cosmetic wrong: the whole point of
   * the signature is to separate "the finger was there and noisy" from "the
   * pulse was barely arriving", and a fabricated clean band puts every
   * no-data refusal in the first group. It also reads, across a report, as
   * proof that nothing is ever refused for noise.
   */
  beats: number;
  /** Seconds of pulse collected before triage (the summed raw intervals). */
  rawSec?: number;
  /** Stretches the reading was collected in (dropouts + 1). */
  segments?: number;
  /** The session's kind, `'breath'` for paced. */
  kind?: string;
}): string {
  const src = o.source || 'unknown';
  const cov = coverageBand(o.coverageSec, o.durationSec);
  const kind = !o.hasFields
    ? 'nodata'
    : cov === 'cov<25' || cov === 'cov25-50'
      ? 'thin'
      : 'noisy';
  // Unknown is never reported as clean, the same rule `isPoorImport` follows in
  // the other direction. Note this is NOT the same question as `hasFields`: a
  // reading can keep beats and still compute no metrics, and there the artifact
  // rate is real and worth having.
  const art = o.beats > 0 ? artifactBand(o.artifactPct) : 'art?';
  return `${src} ${kind} ${art} ${cov}${shapeTokens(o)}`;
}

/**
 * One line describing a reading that ended with NO result: stopped by the app
 * (`signal`), given up on from `Having issues?` (`user`), or finished by hand
 * before there was anything to measure (`early`).
 *
 * `camera signal cov<25 raw50+ seg5+ dur<1m paced`
 *
 * It exists because an abandoned reading was reported by nothing at all. The
 * refusal above is filed by the results card, and an abandoned reading never
 * reaches one — so the better the stop rule got at ending hopeless readings
 * early, the more failed attempts moved out of the only counter that could see
 * them. Coverage here is against the time that actually ELAPSED, since that is
 * the session there was.
 */
export function abandonSignature(o: {
  source?: string;
  reason: string;
  /** Seconds of pulse triage would have kept, as the stop rule judged it. */
  keptSec: number;
  rawSec: number;
  segments: number;
  elapsedSec: number;
  kind?: string;
}): string {
  const src = o.source || 'unknown';
  return `${src} ${o.reason} ${coverageBand(o.keptSec, o.elapsedSec)}${shapeTokens({
    rawSec: o.rawSec, segments: o.segments, durationSec: o.elapsedSec, kind: o.kind,
  })}`;
}

/** A reading that began: `camera paced`. The denominator the refusals and
 *  abandons above are read against, per attempt rather than per install-day. */
export const attemptSignature = (source: string | undefined, kind: string | undefined) =>
  `${source || 'unknown'} ${paceToken(kind)}`;

/** A reading the app filed without asking: `camera fair paced`. */
export const filedSignature = (source: string | undefined, confidence: string | undefined, kind: string | undefined) =>
  `${source || 'unknown'} ${confidence || 'unknown'} ${paceToken(kind)}`;

/**
 * The fault-route tags a capture reports under.
 *
 * Two of them are not failures. `/fault` is the only route that counts every
 * OCCURRENCE, split by platform and build, which is exactly what "how often
 * does a camera reading fail, per attempt" needs — the pings are capped at one
 * per install per day and can only ever say how many PEOPLE. So the attempt and
 * the filed reading ride it too, as the denominator and the success, and
 * `CAPTURE_EVENT_TAGS` is the list a consumer must leave out of any count of
 * things that went wrong.
 */
export const CAPTURE_TAGS = {
  attempt: 'hrv.attempt',
  filed: 'hrv.filed',
  refused: 'hrv.refused',
  salvaged: 'hrv.salvaged',
  abandoned: 'hrv.abandoned',
} as const;
export const CAPTURE_EVENT_TAGS: readonly string[] = [CAPTURE_TAGS.attempt, CAPTURE_TAGS.filed, CAPTURE_TAGS.salvaged];
