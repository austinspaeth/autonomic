import { perMonth, priceAmount } from '../price';

describe('priceAmount', () => {
  it('reads either decimal separator and skips grouping', () => {
    expect(priceAmount('$29.99')).toBe(29.99);
    expect(priceAmount('29,99 €')).toBe(29.99);
    expect(priceAmount('1.234,56 kr')).toBe(1234.56);
    expect(priceAmount('$1,234.56')).toBe(1234.56);
    expect(priceAmount('¥3,500')).toBe(3500);
    expect(priceAmount('CHF 29.90')).toBe(29.9);
  });

  it('is null for nothing parseable', () => {
    expect(priceAmount('')).toBeNull();
    expect(priceAmount('free')).toBeNull();
  });
});

describe('perMonth', () => {
  it('keeps a comma decimal a comma (the 249.92 € bug)', () => {
    expect(perMonth('29,99 €', true)).toBe('2,50 €');
    expect(perMonth('29,99 €', false)).toBe('2,50 €');
  });

  it('keeps a dot decimal a dot', () => {
    expect(perMonth('$24.99', true)).toBe('$2.08');
    expect(perMonth('$24.99', false)).toBe('$2.08');
  });

  it('rounds the sentence figure to whole units once cents are noise', () => {
    expect(perMonth('$249.99', false)).toBe('$21');
    expect(perMonth('$249.99', true)).toBe('$20.83');
  });

  it('respects grouping and zero-decimal currencies', () => {
    expect(perMonth('1.234,56 kr', true)).toBe('102,88 kr');
    expect(perMonth('¥3,500', true)).toBe('¥292');
  });

  it('is null when the price does not parse', () => {
    expect(perMonth('', true)).toBeNull();
  });
});
