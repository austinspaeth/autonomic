import { hexA, mixHex } from '../color';

describe('hexA / mixHex', () => {
  it('makes an rgba string', () => {
    expect(hexA('#ef4444', 0.5)).toBe('rgba(239,68,68,0.5)');
  });
  it('passes non-hex through', () => {
    expect(hexA('red', 0.5)).toBe('red');
  });
  it('blends t parts colour into base', () => {
    expect(mixHex('#ffffff', '#000000', 0.5)).toBe('rgb(128,128,128)');
    expect(mixHex('#ffffff', '#000000', 0)).toBe('rgb(0,0,0)');
    expect(mixHex('#ffffff', '#000000', 1)).toBe('rgb(255,255,255)');
  });
});
