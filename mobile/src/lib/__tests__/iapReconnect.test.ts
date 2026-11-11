/**
 * Play's BillingClient sometimes fails to finish setup ("init-connection:
 * Failed to initialize connection"). The connect used to sit outside the
 * reconnect-and-retry in `withBilling`, so it failed on the first try, and the
 * paywall showed fallback prices and a button that could not work, saying
 * nothing until the tap.
 */
const initConnection = jest.fn();
const endConnection = jest.fn(async () => true);
const fetchProducts = jest.fn();

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { addEventListener: () => ({ remove() {} }) },
}));
jest.mock('react', () => ({ useSyncExternalStore: () => undefined }));
jest.mock('expo-iap', () => ({
  initConnection: (...a: unknown[]) => initConnection(...a),
  endConnection: (...a: unknown[]) => endConnection(...(a as [])),
  fetchProducts: (...a: unknown[]) => fetchProducts(...a),
  getAvailablePurchases: async () => [],
  requestPurchase: async () => undefined,
  finishTransaction: async () => undefined,
  deepLinkToSubscriptions: async () => undefined,
  purchaseUpdatedListener: () => ({ remove() {} }),
  purchaseErrorListener: () => ({ remove() {} }),
}), { virtual: true });
jest.mock('../../../modules/app-env', () => ({
  isSideloadedAndroidBuild: () => false,
  isTestFlightBuild: () => false,
}));
jest.mock('../diagnostics/errorLog', () => ({ logError: jest.fn() }));

(global as unknown as { __DEV__: boolean }).__DEV__ = false;

const initFailure = () => Object.assign(new Error('Failed to initialize connection'), { code: 'init-connection' });
const product = {
  id: 'com.autonomic.journal.yearly', productId: 'com.autonomic.journal.yearly', displayPrice: '$79.99',
  subscriptionOfferDetailsAndroid: [],
};

beforeEach(() => {
  jest.resetModules();
  initConnection.mockReset();
  endConnection.mockClear();
  fetchProducts.mockReset();
});

test('a connect that fails once is torn down and retried before giving up', async () => {
  initConnection.mockRejectedValueOnce(initFailure()).mockResolvedValue(true);
  fetchProducts.mockResolvedValue([product]);
  const iap = await import('../../store/iap');
  await iap.ensureIapReady();
  expect(endConnection).toHaveBeenCalled();
  expect(initConnection).toHaveBeenCalledTimes(2);
  expect(iap.getIapState().products.length).toBe(1);
  expect(iap.getIapState().error).toBeUndefined();
});

test('a store that still will not connect says so on the paywall, before the tap', async () => {
  initConnection.mockRejectedValue(initFailure());
  const iap = await import('../../store/iap');
  await iap.ensureIapReady();
  const error = iap.getIapState().error;
  expect(error).toMatch(/Google Play/);
  expect(error).toMatch(/signed in/);
  expect(iap.getIapState().blocked).toBeUndefined();
});
