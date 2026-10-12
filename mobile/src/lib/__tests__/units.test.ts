import {
  CUP_L, cmToInches, distText, distToMi, fieldShown, fieldStored, fieldUnit, fmtDist, fmtHeight,
  fmtPressureGap, fmtWater, fmtWeight, getUnits, heightCmText, paceStr, resolveUnits, setUnits,
  waterNum, waterToL, weightText, weightToLb,
} from '../units';
import { TREND_METRICS } from '../trends';
import { fieldLabel } from '../registry';

afterEach(() => setUnits('imperial'));

describe('units', () => {
  it('defaults to imperial, and only an explicit metric changes that', () => {
    expect(getUnits()).toBe('imperial');
    expect(resolveUnits(undefined)).toBe('imperial');
    expect(resolveUnits('nonsense')).toBe('imperial');
    expect(resolveUnits('metric')).toBe('metric');
  });

  it('keeps one glass a quarter litre in both systems', () => {
    expect(CUP_L).toBe(0.25);
    expect(fmtWater(CUP_L, 'metric')).toBe('0.25 L');
    expect(fmtWater(CUP_L, 'imperial')).toBe('8 oz');
    // Ten glasses is the default goal either way.
    expect(fmtWater(10 * CUP_L, 'metric')).toBe('2.5 L');
    expect(fmtWater(10 * CUP_L, 'imperial')).toBe('85 oz');
  });

  it('reads a typed ounce amount back as the same number', () => {
    for (let oz = 1; oz <= 200; oz++) expect(waterNum(waterToL(oz, 'imperial'), 'imperial')).toBe(oz);
    expect(waterToL(2.5, 'metric')).toBe(2.5);
  });

  it('converts weight at the edges and leaves imperial text alone', () => {
    expect(weightText('150', 'imperial')).toBe('150');
    expect(weightToLb('150', 'imperial')).toBe('150');
    expect(weightText(weightToLb('70', 'metric'), 'metric')).toBe('70');
    expect(fmtWeight('154.32', 'metric')).toBe('70 kg');
    expect(fmtWeight('150', 'imperial')).toBe('150 lb');
    expect(fmtWeight('', 'metric')).toBe('');
  });

  it('formats height from stored inches, never as 12 inches', () => {
    expect(fmtHeight('68', 'imperial')).toBe('5′ 8″');
    expect(fmtHeight('71.6', 'imperial')).toBe('6′ 0″');
    expect(fmtHeight('68', 'metric')).toBe('173 cm');
    expect(heightCmText(cmToInches('170'))).toBe('170');
    expect(fmtHeight('', 'metric')).toBe('');
  });

  it('converts distance and pace from stored miles', () => {
    expect(fmtDist('3.1', 'imperial')).toBe('3.1 mi');
    expect(fmtDist('3.107', 'metric')).toBe('5 km');
    expect(distText(distToMi('5', 'metric'), 'metric')).toBe('5');
    expect(distToMi('3.1', 'imperial')).toBe('3.1');
    expect(paceStr(30, 3, 'imperial')).toBe('10:00 /mi');
    expect(paceStr(30, 3.10686, 'metric')).toBe('6:00 /km');
    expect(paceStr(1, 3, 'imperial')).toBeNull();
  });

  it('only converts the fields declared in miles', () => {
    expect(fieldUnit('min', 'metric')).toBe('min');
    expect(fieldUnit('mi', 'metric')).toBe('km');
    expect(fieldShown('min', '30', 'metric')).toBe('30');
    expect(fieldStored('min', '30', 'metric')).toBe('30');
    expect(fieldStored('mi', '5', 'metric')).toBe('3.107');
  });

  it('states the low pressure bar in either unit', () => {
    expect(fmtPressureGap(0.2 * 33.8639, 'imperial')).toBe('0.20 inHg');
    expect(fmtPressureGap(0.2 * 33.8639, 'metric')).toBe('7 hPa');
  });

  it('is what the registries print through', () => {
    const w = TREND_METRICS.waterIntake;
    expect(`${w.fmt(2.5)} ${w.unit}`).toBe('85 oz');
    expect(fieldLabel({ key: 'distance', label: 'Distance', unit: 'mi' })).toBe('Distance (mi)');
    setUnits('metric');
    expect(`${w.fmt(2.5)} ${w.unit}`).toBe('2.5 L');
    expect(w.phrase(0.42)).toBe('up 0.4 L');
    expect(fieldLabel({ key: 'distance', label: 'Distance', unit: 'mi' })).toBe('Distance (km)');
  });
});
