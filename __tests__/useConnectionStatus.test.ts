import {
  subscribeToNetworkAvailability,
  type NetworkAvailabilitySource,
} from '../src/hooks/useConnectionStatus';

describe('network availability subscription', () => {
  it('dispatches the initial observation, changed availability only, and cleans up the one listener', () => {
    let listener: ((available: boolean) => void) | undefined;
    const cleanup = jest.fn();
    const source: NetworkAvailabilitySource = {
      addEventListener: jest.fn(callback => {
        listener = callback;
        return cleanup;
      }),
    };
    const dispatch = jest.fn();

    const unsubscribe = subscribeToNetworkAvailability(source, dispatch);

    expect(source.addEventListener).toHaveBeenCalledTimes(1);
    listener?.(false);
    listener?.(false);
    listener?.(true);
    listener?.(true);
    listener?.(false);
    expect(dispatch).toHaveBeenNthCalledWith(1, { type: 'networkObserved', available: false });
    expect(dispatch).toHaveBeenNthCalledWith(2, { type: 'networkRestored' });
    expect(dispatch).toHaveBeenNthCalledWith(3, { type: 'networkLost' });
    expect(dispatch).toHaveBeenCalledTimes(3);

    unsubscribe();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
