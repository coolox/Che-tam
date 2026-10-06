import AsyncStorage from '@react-native-async-storage/async-storage';

const INVITATION_ADMISSION_KEY = 'invitation_admission';

export interface InvitationAdmission {
  admitted: boolean;
  displayName: string | null;
}

export interface InvitationAdmissionPreference {
  getAdmission(): Promise<InvitationAdmission>;
  setAdmitted(displayName: string): Promise<void>;
}

function parseAdmission(raw: string | null): InvitationAdmission {
  if (!raw) return { admitted: false, displayName: null };
  try {
    const parsed = JSON.parse(raw) as Partial<InvitationAdmission>;
    return parsed.admitted === true && typeof parsed.displayName === 'string' && parsed.displayName.trim().length > 0
      ? { admitted: true, displayName: parsed.displayName }
      : { admitted: false, displayName: null };
  } catch {
    return { admitted: false, displayName: null };
  }
}

export function createAsyncInvitationAdmissionPreference(): InvitationAdmissionPreference {
  return {
    async getAdmission() {
      return parseAdmission(await AsyncStorage.getItem(INVITATION_ADMISSION_KEY));
    },
    async setAdmitted(displayName) {
      await AsyncStorage.setItem(INVITATION_ADMISSION_KEY, JSON.stringify({ admitted: true, displayName }));
    },
  };
}

export function createInMemoryInvitationAdmissionPreference(initial: InvitationAdmission = { admitted: false, displayName: null }): InvitationAdmissionPreference {
  let admission = initial;
  return {
    async getAdmission() { return admission; },
    async setAdmitted(displayName) { admission = { admitted: true, displayName }; },
  };
}
