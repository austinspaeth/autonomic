/**
 * The where-were-you prefix on uncaught errors. It only earns its place if it
 * survives the trip to the Failures tab, so the last block runs it through the
 * real fault redactor.
 */
import { condenseReactMessage, crashContext, routeLabel, withContext } from '../crashContext';
import { MAX_FAULT_MSG, redactMessage } from '../../errorReport';

const LOOP = 'Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.';

describe('routeLabel', () => {
  it('names the Journal tab, which is the bare root', () => {
    expect(routeLabel('/')).toBe('journal');
  });

  it('drops the slash, which the redactor would read as a path', () => {
    expect(routeLabel('/insights')).toBe('insights');
    expect(routeLabel('/a/b')).toBe('a.b');
  });

  it('drops a query, which can carry anything', () => {
    expect(routeLabel('/?capture=hrv')).toBe('journal');
    expect(routeLabel('/analysis?range=month')).toBe('analysis');
  });

  it('says nothing when nothing is known', () => {
    expect(routeLabel('')).toBe('');
    expect(routeLabel(undefined)).toBe('');
  });
});

describe('crashContext', () => {
  it('lists route, sheets and background, skipping what is unknown', () => {
    expect(crashContext({ background: true }, { route: 'insights', sheets: 2 })).toBe('insights, 2 sheets, bg');
    expect(crashContext({}, { route: 'journal', sheets: 1 })).toBe('journal, 1 sheet');
    expect(crashContext({}, { route: '', sheets: 0 })).toBe('');
  });
});

describe('condenseReactMessage', () => {
  it('keeps the invariant and drops the advice after it', () => {
    expect(condenseReactMessage(LOOP)).toBe('Maximum update depth exceeded');
  });

  it('keeps a type or wrapper ahead of it', () => {
    expect(condenseReactMessage(`Error: ${LOOP}`)).toBe('Error: Maximum update depth exceeded');
  });

  it('leaves every other message alone', () => {
    expect(condenseReactMessage('TypeError: x is undefined')).toBe('TypeError: x is undefined');
  });
});

describe('on the way to the Failures tab', () => {
  it('keeps the whole context and the whole invariant inside the fault budget', () => {
    const msg = withContext(LOOP, 'insights, 2 sheets, bg');
    const sent = redactMessage(msg);
    expect(sent).toBe('[insights, 2 sheets, bg] Maximum update depth exceeded');
    expect(sent.length).toBeLessThan(MAX_FAULT_MSG);
  });

  it('adds no brackets when there is no context', () => {
    expect(withContext('boom', '')).toBe('boom');
  });
});
