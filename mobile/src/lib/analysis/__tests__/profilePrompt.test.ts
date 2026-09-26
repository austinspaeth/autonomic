/**
 * Every prompt tells the model not to ASSUME an age or sex, so a prompt that has
 * them must state them. The big reports used to carry neither.
 */
import { buildDataExport, buildPrompt, profileBlock, profileLine, REPORT_CARDS } from '../reports';
import { buildCorrelationsPrompt } from '../../insights/prompt';
import { demoState } from '../../demo';
import { todayKey } from '../../dates';
import type { AppState } from '../../types';

const withProfile = (sex: string, birthday: string): AppState => {
  const s = demoState({ version: 1, settings: {}, profile: { sex: '', birthday: '', weight: '', height: '' }, days: {}, meta: {} } as unknown as AppState);
  return { ...s, profile: { sex, birthday, weight: '150', height: '70' } };
};

describe('profile in prompts', () => {
  const bday = `${new Date().getFullYear() - 40}-01-01`;

  it('states age and sex, never the birthday or body measurements', () => {
    const line = profileLine({ sex: 'Female', birthday: bday, weight: '150', height: '70' });
    expect(line).toMatch(/^Age: (39|40) \| Sex: Female$/);
    expect(line).not.toContain(bday);
  });

  it('is empty when nothing is filled in', () => {
    expect(profileBlock({ sex: '', birthday: '', weight: '', height: '' })).toBe('');
  });

  it('rides the full health report, the data export and the correlations prompt', () => {
    const s = withProfile('Male', bday);
    const overall = REPORT_CARDS.find((c) => c.id === 'overall')!;
    expect(buildPrompt(s, {}, [overall], 'month', todayKey())).toContain('PROFILE (self-entered): Age: ');
    expect(buildDataExport(s, {}, 'month', todayKey())).toContain('Sex: Male');
    expect(buildCorrelationsPrompt(s, {}, [], null).prompt).toContain('Sex: Male');
  });
});
