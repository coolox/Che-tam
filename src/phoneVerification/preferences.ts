import AsyncStorage from '@react-native-async-storage/async-storage';

const PHONE_VERIFICATION_COMPLETE_KEY = 'phone_verification_complete';

export interface PhoneVerificationPreference {
  getComplete(): Promise<boolean>;
  setComplete(): Promise<void>;
}

export function createAsyncPhoneVerificationPreference(): PhoneVerificationPreference {
  return {
    async getComplete() {
      return (await AsyncStorage.getItem(PHONE_VERIFICATION_COMPLETE_KEY)) === 'true';
    },
    async setComplete() {
      await AsyncStorage.setItem(PHONE_VERIFICATION_COMPLETE_KEY, 'true');
    },
  };
}

export function createInMemoryPhoneVerificationPreference(initiallyComplete = false): PhoneVerificationPreference {
  let complete = initiallyComplete;
  return {
    async getComplete() { return complete; },
    async setComplete() { complete = true; },
  };
}
