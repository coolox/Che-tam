import { useEffect, useReducer } from 'react';
import NetInfo from '@react-native-community/netinfo';

import {
  connectionReducer,
  getConnectionPresentation,
  initialConnectionStatus,
  type ConnectionEvent,
  type ConnectionPresentation,
  type ConnectionStatus,
} from '../transport/connectionState';

export type NetworkAvailabilitySource = {
  addEventListener(listener: (available: boolean) => void): () => void;
};

const netInfoSource: NetworkAvailabilitySource = {
  addEventListener(listener) {
    return NetInfo.addEventListener(state => listener(state.isConnected === true));
  },
};

export function subscribeToNetworkAvailability(
  source: NetworkAvailabilitySource,
  dispatch: (event: ConnectionEvent) => void,
): () => void {
  let lastAvailability: boolean | null = null;

  return source.addEventListener(available => {
    if (lastAvailability === null) {
      lastAvailability = available;
      dispatch({ type: 'networkObserved', available });
      return;
    }

    if (available === lastAvailability) {
      return;
    }

    lastAvailability = available;
    dispatch({ type: available ? 'networkRestored' : 'networkLost' });
  });
}

export function useConnectionStatus(source: NetworkAvailabilitySource = netInfoSource): ConnectionPresentation {
  const [status, dispatch] = useReducer(connectionReducer, initialConnectionStatus);

  useEffect(() => subscribeToNetworkAvailability(source, dispatch), [source]);

  return getConnectionPresentation(status);
}

export type { ConnectionStatus };
