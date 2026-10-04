export type {
  AuthAvailability,
  AuthErrorCategory,
  AuthFailure,
  AuthResult,
  AuthRoute,
  AuthSession,
  AuthState,
  AuthStatus,
  AuthSuccess,
  AuthTransport,
  DeviceBindingRequest,
  InviteRedeemRequest,
  InviteRedeemResponse,
  LoginRequest,
  OpaqueId,
  RegisterRequest,
} from './types';
export { resolveAuthRoute, type NavigationDecision } from './navigation';
export { isValidAuthSession, type SecureSessionStorage } from './sessionStorage';
export {
  applyAuthFailure,
  initialAuthState,
  loginWithLocalSession,
  logoutLocalSession,
  registerWithLocalSession,
  restoreLocalSession,
  runAuthTransportAttempt,
} from './service';
export { buildAuthViewModel, type AuthViewModel } from './viewModel';
export { getAuthErrorMessage, validateInviteInput, validateLoginInput, type ValidationResult } from './validation';
