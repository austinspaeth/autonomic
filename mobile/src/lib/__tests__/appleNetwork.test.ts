import { appleNetworkFailure } from '../appleNetwork';

test('reads the NSURL code out of the bare Foundation message', () => {
  expect(appleNetworkFailure('The operation couldn’t be completed. (NSURLErrorDomain error -1009.)'))
    .toEqual({ code: -1009, name: 'nsurl-notConnectedToInternet' });
  expect(appleNetworkFailure('The operation couldn’t be completed. (NSURLErrorDomain error -1020.)'))
    .toEqual({ code: -1020, name: 'nsurl-dataNotAllowed' });
  expect(appleNetworkFailure('Error Domain=NSURLErrorDomain Code=-1001 "The request timed out."'))
    .toEqual({ code: -1001, name: 'nsurl-timedOut' });
});

test('an unnamed NSURL code still counts as a network failure', () => {
  expect(appleNetworkFailure('(NSURLErrorDomain error -1234.)')).toEqual({ code: -1234, name: 'nsurl-other' });
});

test('Foundation’s own sentences count too', () => {
  expect(appleNetworkFailure('The Internet connection appears to be offline.')?.name).toBe('nsurl-notConnectedToInternet');
  expect(appleNetworkFailure('The network connection was lost.')?.name).toBe('nsurl-networkConnectionLost');
});

test('anything else is not a network failure', () => {
  expect(appleNetworkFailure('Unable to Complete Request')).toBeNull();
  expect(appleNetworkFailure('Couldn’t communicate with a helper application.')).toBeNull();
  expect(appleNetworkFailure(undefined)).toBeNull();
});
