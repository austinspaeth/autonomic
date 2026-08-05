import { MAX_MSG, parseErrorLog, pushError, trimMessage, type LoggedError } from '../errorBuffer';

const row = (over: Partial<LoggedError> = {}): LoggedError => ({
  at: '2026-08-05T10:00:00.000Z', tag: 'store.persist', msg: 'disk full', ...over,
});

describe('pushError', () => {
  it('appends distinct failures, newest last', () => {
    const out = pushError(pushError([], row()), row({ tag: 'iap.init', msg: 'no connection' }));
    expect(out.map((e) => e.tag)).toEqual(['store.persist', 'iap.init']);
  });

  it('collapses consecutive repeats into a count instead of flushing the window', () => {
    let list: LoggedError[] = [];
    for (let i = 0; i < 50; i++) list = pushError(list, row({ at: `2026-08-05T10:00:${String(i).padStart(2, '0')}.000Z` }));
    expect(list).toHaveLength(1);
    expect(list[0].n).toBe(50);
    expect(list[0].first).toBe('2026-08-05T10:00:00.000Z');   // first occurrence kept
    expect(list[0].at).toBe('2026-08-05T10:00:49.000Z');      // timestamp is the latest
  });

  it('does not collapse across a different tag, message, or fatality', () => {
    const list = [row(), row({ msg: 'other' }), row(), row({ fatal: true })]
      .reduce<LoggedError[]>((acc, e) => pushError(acc, e), []);
    expect(list).toHaveLength(4);
  });

  it('drops the oldest rows past the cap', () => {
    let list: LoggedError[] = [];
    for (let i = 0; i < 10; i++) list = pushError(list, row({ msg: `err ${i}` }), 4);
    expect(list.map((e) => e.msg)).toEqual(['err 6', 'err 7', 'err 8', 'err 9']);
  });

  it('truncates and flattens the message', () => {
    const out = pushError([], row({ msg: `a\n  b ${'x'.repeat(400)}` }));
    expect(out[0].msg.length).toBe(MAX_MSG);
    expect(out[0].msg.startsWith('a b x')).toBe(true);
  });
});

describe('trimMessage', () => {
  it('leaves a short message alone', () => {
    expect(trimMessage('  code 600:  denied ')).toBe('code 600: denied');
  });
});

describe('parseErrorLog', () => {
  it('reads back what was written', () => {
    const list = pushError([], row());
    expect(parseErrorLog(JSON.stringify(list))).toEqual(list);
  });

  it('never throws on junk — a corrupt log must not break a dump', () => {
    expect(parseErrorLog('not json')).toEqual([]);
    expect(parseErrorLog('{"a":1}')).toEqual([]);
    expect(parseErrorLog(null)).toEqual([]);
    expect(parseErrorLog(JSON.stringify([row(), { nope: true }, null]))).toHaveLength(1);
  });

  it('trims a log that grew past the cap in an older build', () => {
    const many = Array.from({ length: 80 }, (_, i) => row({ msg: `e${i}` }));
    expect(parseErrorLog(JSON.stringify(many), 5).map((e) => e.msg)).toEqual(['e75', 'e76', 'e77', 'e78', 'e79']);
  });
});
