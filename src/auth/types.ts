export type OpaqueId = string;

export type AuthErrorCategory =
  | 'offline'
  | 'invalid_invite'
  | 'invalid_credentials'
  | 'session_expired'
  | 'device_replaced'
  | 'unknown';

export type InviteRedeemRequest = {
  inviteText: string;
  deviceId: OpaqueId;
};

export type InviteRedeemResponse = {
  inviteId: OpaqueId;
};

export type RegisterRequest = {
  inviteId: OpaqueId;
  displayName: string;
  identity: string;
  password: string;
  deviceId: OpaqueId;
};

export type LoginRequest = {
  identity: string;
  password: string;
  deviceId: OpaqueId;
};

export type DeviceBindingRequest = {
  accountId: OpaqueId;
  profileId: OpaqueId;
  deviceId: OpaqueId;
};

export type AuthSession = {
  sessionId: OpaqueId;
  accountId: OpaqueId;
  profileId: OpaqueId;
  deviceId: OpaqueId;
};

export type AuthSuccess<T> = {
  ok: true;
  value: T;
};

export type AuthFailure = {
  ok: false;
  category: AuthErrorCategory;
};

export type AuthResult<T> = AuthSuccess<T> | AuthFailure;

export type AuthTransport = {
  redeemInvite(request: InviteRedeemRequest): Promise<AuthResult<InviteRedeemResponse>>;
  register(request: RegisterRequest): Promise<AuthResult<AuthSession>>;
  login(request: LoginRequest): Promise<AuthResult<AuthSession>>;
  restore(session: AuthSession): Promise<AuthResult<AuthSession>>;
  bindDevice(request: DeviceBindingRequest): Promise<AuthResult<AuthSession>>;
  logout(session: AuthSession): Promise<AuthResult<null>>;
};

export type AuthAvailability = {
  available: boolean;
};

export type AuthRoute = 'authEntry' | 'appEntry' | 'protected';

export type AuthStatus = 'checking' | 'anonymous' | 'authenticated';

export type AuthState = {
  status: AuthStatus;
  session: AuthSession | null;
  error: AuthErrorCategory | null;
};
