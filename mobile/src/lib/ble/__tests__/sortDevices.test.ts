import { sortDevices, type BleDevice } from '../devices';

const dev = (id: string, rssi: number, connected?: boolean): BleDevice =>
  ({ id, name: id, rssi, ...(connected ? { connected } : {}) });

describe('sortDevices', () => {
  it('sorts by signal strength, strongest first', () => {
    const out = sortDevices([dev('far', -90), dev('near', -40), dev('mid', -65)]);
    expect(out.map((d) => d.id)).toEqual(['near', 'mid', 'far']);
  });

  it('floats already-connected straps above stronger advertisers', () => {
    // A strap the OS already holds reports no meaningful RSSI, but it is the
    // surest bet in the list — it must not sink below a loud stranger.
    const out = sortDevices([dev('loud', -30), dev('linked', -100, true)]);
    expect(out.map((d) => d.id)).toEqual(['linked', 'loud']);
  });

  it('orders connected straps among themselves by signal', () => {
    const out = sortDevices([dev('a', -80, true), dev('b', -50, true)]);
    expect(out.map((d) => d.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input', () => {
    const input = [dev('far', -90), dev('near', -40)];
    sortDevices(input);
    expect(input.map((d) => d.id)).toEqual(['far', 'near']);
  });
});
