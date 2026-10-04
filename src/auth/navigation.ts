import type { AuthRoute, AuthState } from './types';

export type NavigationDecision = {
  route: AuthRoute;
  redirected: boolean;
};

export function resolveAuthRoute(state: Pick<AuthState, 'status' | 'session'>, requestedRoute: AuthRoute): NavigationDecision {
  const authenticated = state.status === 'authenticated' && state.session !== null;

  if (!authenticated && requestedRoute === 'protected') {
    return { route: 'authEntry', redirected: true };
  }

  if (authenticated && requestedRoute === 'authEntry') {
    return { route: 'appEntry', redirected: true };
  }

  return { route: requestedRoute, redirected: false };
}
