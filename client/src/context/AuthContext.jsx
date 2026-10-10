import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService.js';
import { setTracking } from '../services/trackingService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [demo, setDemo] = useState(() => authService.isDemoSession());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService
      .getCurrentUser()
      .then(setUser)
      .catch(() => authService.logout())
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(async () => {
    // Signing out of the website stops tracking until the next web sign-in (not for demo sessions).
    if (user?.role === 'employee' && !demo) await setTracking('stopped').catch(() => {});
    authService.logout();
    setDemo(false);
    setUser(null);
  }, [user, demo]);

  // An expired token can't reach the server, so this path only clears the local session.
  const expire = useCallback(() => {
    authService.logout();
    setDemo(false);
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener('workplus:unauthorized', expire);
    return () => window.removeEventListener('workplus:unauthorized', expire);
  }, [expire]);

  const login = useCallback(async (email, password) => {
    const signedIn = await authService.login(email, password);
    // Signing in on the website starts tracking in the employee's desktop agent.
    if (signedIn.role === 'employee') await setTracking('active').catch(() => {});
    setDemo(false);
    setUser(signedIn);
    return signedIn;
  }, []);

  /** Explore as a demo role. Demo sessions never start real tracking in a desktop agent. */
  const loginDemo = useCallback(async (role) => {
    const signedIn = await authService.demoLogin(role);
    setDemo(true);
    setUser(signedIn);
    return signedIn;
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    setUser(await authService.changePassword(currentPassword, newPassword));
  }, []);

  const value = useMemo(
    () => ({ user, loading, demo, login, loginDemo, logout, changePassword }),
    [user, loading, demo, login, loginDemo, logout, changePassword]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
