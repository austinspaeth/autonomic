/**
 * iPhones with no signal: StoreKit 2 fails the product query with a bare
 * NSURLErrorDomain error, and openiap reports it twice, as the fetch's own
 * rejection AND on the purchase-error listener, even when nobody is buying.
 * That put every offline foreground on the Failures tab as
 * `iap.purchaseError`, and set "This plan isn't available on your App Store
 * account yet" on the paywall before anyone tapped.
 */
const initConnection = jest.fn(async () => true);
const fetchProducts = jest.fn();
const requestPurchase = jest.fn();
const logError = jest.fn();
let onPurchaseError: ((e: unknown) => void) | undefined;

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: () => ({ remove() {} }) },
}));
jest.mock('react', () => ({ useSyncExternalStore: () => undefined }));
jest.mock('expo-iap', () => ({
  initConnection: (...a: unknown[]) => initConnection(...(a as [])),
  endConnection: async () => true,
  fetchProducts: (...a: unknown[]) => fetchProducts(...a),
  getAvailablePurchases: async () => [],
  requestPurchase: (...a: unknown[]) => requestPurchase(...a),
  finishTransaction: async () => undefined,
  deepLinkToSubscriptions: async () => undefined,
  purchaseUpdatedListener: () => ({ remove() {} }),
  purchaseErrorListener: (fn: (e: unknown) => void) => { onPurchaseError = fn; return { remove() {} }; },
}), { virtual: true });
jest.mock('../../../modules/app-env', () => ({
  isSideloadedAndroidBuild: () => false,
  isTestFlightBuild: () => false,
}));
jest.mock('../diagnostics/errorLog', () => ({ logError: (...a: unknown[]) => logError(...a) }));

(global as unknown as { __DEV__: boolean }).__DEV__ = false;

const MSG = 'The operation couldn’t be completed. (NSURLErrorDomain error -1009.)';
const offline = () => Object.assign(new Error(MSG), { code: 'query-product', debugMessage: MSG });

/** What openiap does: emit on the listener, then reject the fetch. */
const failFetchLikeOpeniap = () => fetchProducts.mockImplementation(async () => {
  onPurchaseError?.(offline());
  throw offline();
});

beforeEach(() => {
  jest.resetModules();
  onPurchaseError = undefined;
  fetchProducts.mockReset();
  requestPurchase.mockReset();
  logError.mockReset();
});

const tags = () => logError.mock.calls.map((c) => c[0]);

test('an offline product fetch on paywall open is not a purchase error', async () => {
  failFetchLikeOpeniap();
  const iap = await import('../../store/iap');
  await iap.ensureIapReady();
  expect(tags()).toEqual(['iap.retryProducts']);
  expect(iap.getIapState().error).toBeUndefined();
});

test('the fetch failure is reported with a name that survives redaction', async () => {
  failFetchLikeOpeniap();
  const iap = await import('../../store/iap');
  await iap.ensureIapReady();
  expect(String((logError.mock.calls[0][1] as Error).message)).toMatch(/nsurl-notConnectedToInternet/);
});

test('a buy tap with no signal says the App Store could not be reached', async () => {
  failFetchLikeOpeniap();
  const iap = await import('../../store/iap');
  const started = await iap.subscribe();
  expect(started).toBe(false);
  expect(iap.getIapState().error).toMatch(/Couldn’t reach App Store/);
  expect(iap.getIapState().error).not.toMatch(/isn’t available/);
  expect(tags()).toContain('iap.purchase');
});

test('a real product problem keeps its own message', async () => {
  fetchProducts.mockRejectedValue(Object.assign(new Error('Unable to Complete Request'), { code: 'query-product' }));
  const iap = await import('../../store/iap');
  await iap.subscribe();
  expect(iap.getIapState().error).toMatch(/isn’t available on your App Store account/);
});

test('a purchase that fails on the listener while buying is still reported', async () => {
  jest.useFakeTimers();   // the purchase watchdog
  fetchProducts.mockResolvedValue([{ id: 'com.autonomic.journal.yearly', productId: 'com.autonomic.journal.yearly', displayPrice: '$49.99' }]);
  requestPurchase.mockImplementation(async () => { onPurchaseError?.(offline()); });
  const iap = await import('../../store/iap');
  await iap.subscribe();
  expect(tags()).toContain('iap.purchaseError');
  expect(iap.getIapState().error).toMatch(/Couldn’t reach App Store/);
  jest.useRealTimers();
});
