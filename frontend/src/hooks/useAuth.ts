import { useState, useEffect, useCallback } from 'react';
import { authApi, userApi } from '../services/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    loading: true,
  });

  useEffect(() => {
    authApi
      .status()
      .then(() => userApi.me())
      .then((res) => setState({ user: res.data, isAuthenticated: true, loading: false }))
      .catch(() => setState({ user: null, isAuthenticated: false, loading: false }));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    await authApi.login(username, password);
    const res = await userApi.me();
    setState({ user: res.data, isAuthenticated: true, loading: false });
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setState({ user: null, isAuthenticated: false, loading: false });
  }, []);

  return { ...state, login, logout };
}
