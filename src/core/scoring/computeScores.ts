// Ported from legacy docs/index.html (~lines 3096-3158): computeScores(r).
// DECOUPLED: legacy read state.profile.sex (for qtcBands) and called
// bmiFor(r.weight) which read state.profile.height. Both now arrive via a
// `profile: Profile` param: state.profile.sex -> profile.sex, and
// bmiFor(r.weight) -> bmiFor(r.weight, profile.height).

import {
  sRMSSDu,
  sRMSSDs,
  sPNN50,
  sSDNN,
  sTotalPower,
  sVLF,
  sReadiness,
  sSpo2,
  sRestingHr,
  sQRS,
  sPR,
  sEctopic,
  sCoherence,
  sLfPeak,
  sLfHf,
  sHfPeak,
  sHR,
  sRrMode,
  sMxDMn,
  sAMo50,
  sCV,
  sRhythm,
  sSys,
  sDia,
  sBP,
  totalPower,
} from '@core/scoring/scorers';
import { BANDS, catFromBands, qtcBands } from '@core/scoring/bands';
import { numOr, worstCat } from '@core/scoring/colors';
import { bmiFor, bmiZone } from '@core/scoring/bmi';
import type { Reading, Profile, ScoreCategory } from '@core/types';

type Raw = number | string | null | undefined;

export function computeScores(
  r: Reading,
  profile: Profile,
): Record<string, ScoreCategory> {
  // The dynamic Entry fields are typed `unknown`; these readers narrow them to
  // the loose `Raw` / string shapes the scorers and parseFloat expect, without
  // altering any value or branch.
  const f = (k: string): Raw => r[k] as Raw;
  const str = (k: string): string => r[k] as string;
  const optStr = (k: string): string | null | undefined =>
    r[k] as string | null | undefined;

  const s: Record<string, ScoreCategory> = {};
  const put = (k: string, c: ScoreCategory | null | undefined): void => {
    if (c) s[k] = c;
  };
  switch (r.type) {
    case 'hrv': {
      put('readiness', sReadiness(f('readiness')));
      put('rmssd', sRMSSDu(f('rmssd')));
      put('sdnn', sSDNN(f('sdnn')));
      put('avgHr', sHR(f('avgHr')));
      const band = (k: string, b: typeof BANDS[keyof typeof BANDS]): void => {
        const v = numOr(r[k]);
        if (v != null) put(k, catFromBands(v, b));
      };
      band('pns', BANDS.pns);
      band('sns', BANDS.sns);
      band('stressIndex', BANDS.stressIndex);
      const lf = parseFloat(str('lowPower')),
        hf = parseFloat(str('highPower'));
      if (!isNaN(lf) && !isNaN(hf) && hf !== 0)
        put('lfhf', catFromBands(lf / hf, BANDS.lfhf));
      break;
    }
    case 'breathHrv': {
      put('sdnn', sSDNN(f('sdnn')));
      put('rmssd', sRMSSDs(f('rmssd')));
      put('pnn50', sPNN50(f('pnn50')));
      put('totalPower', sTotalPower(totalPower(r)));
      put('vlf', sVLF(f('vlowPower')));
      put('coherence', sCoherence(f('coherence')));
      put('lfPeak', sLfPeak(f('lfPeak')));
      put('hfPeak', sHfPeak(f('hfPeak'), optStr('style')));
      const lf = parseFloat(str('lowPower')),
        hf = parseFloat(str('highPower'));
      if (!isNaN(lf) && !isNaN(hf) && hf !== 0) put('lfhf', sLfHf(lf / hf));
      put('hr', sHR(f('hr')));
      put('meanRr', sRrMode(f('meanRr')));
      put('mode', sRrMode(f('mode')));
      put('mxdmn', sMxDMn(f('mxdmn')));
      put('amo50', sAMo50(f('amo50')));
      put('cv', sCV(f('cv')));
      put('overall', worstCat([s.rmssd, s.pnn50, s.totalPower].filter(Boolean)));
      break;
    }
    case 'mood': {
      const m = (
        {
          'Feeling amazing': 'great',
          'Feeling normal': 'good',
          'Feeling bad': 'bad',
          'Feeling like a crash': 'crash',
        } as Record<string, ScoreCategory>
      )[str('mood')];
      if (m) s.mood = m;
      break;
    }
    case 'bp':
      put('sys', sSys(f('sys')));
      put('dia', sDia(f('dia')));
      put('bp', sBP(f('sys'), f('dia')));
      break;
    case 'bloodO2':
      put('value', sSpo2(f('value')));
      break;
    case 'restingHr':
      put('hr', sRestingHr(f('hr'), optStr('position')));
      break;
    case 'ecg': {
      const q = numOr(r.qtc);
      if (q != null) put('qtc', catFromBands(q, qtcBands(profile && profile.sex)));
      put('qrs', sQRS(f('qrs')));
      put('pr', sPR(f('pr')));
      put('ectopic', sEctopic(f('ectopic')));
      put('rhythm', sRhythm(r));
      const h = numOr(r.hrv);
      if (h != null) put('hrv', catFromBands(h, BANDS.ecgHrv));
      put('overall', worstCat([s.qtc, s.qrs, s.pr, s.ectopic, s.rhythm].filter(Boolean)));
      break;
    }
    case 'weight': {
      const bmi = bmiFor(f('weight'), profile.height);
      if (bmi != null) s.weight = bmiZone(bmi).cat;
      break;
    }
    case 'orthostatic': {
      const before = numOr(r.beforeHr),
        after = numOr(r.afterHr),
        min1 = numOr(r.hr1min);
      if (before != null && after != null)
        put('increase', catFromBands(after - before, BANDS.orthoIncrease));
      if (after != null && min1 != null)
        put('recovery', catFromBands(after - min1, BANDS.orthoRecovery));
      if (s.increase) s.overall = s.increase; // the event is rated on the standing rise
      break;
    }
  }
  return s;
}
