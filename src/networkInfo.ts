import NetInfo from '@react-native-community/netinfo';

import { CanaryNetworkType } from './types';

export async function getCoarseNetworkType(): Promise<CanaryNetworkType> {
  const state = await NetInfo.fetch();
  switch (state.type) {
    case 'wifi':
      return 'wifi';
    case 'cellular':
      return 'cellular';
    case 'ethernet':
      return 'ethernet';
    case 'none':
      return 'none';
    default:
      return 'unknown';
  }
}
