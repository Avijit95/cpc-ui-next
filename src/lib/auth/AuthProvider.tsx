"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  authApi,
  configureApiClient,
  meApi,
  refreshAccessToken,
  type LoginResponse,
  type PublicUser,
} from "@/lib/api";

type AuthState = {
  user: PublicUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
};

type AuthContextValue = AuthState & {
  setSession: (resp: LoginResponse) => void;
  refreshUser: () => Promise<PublicUser | null>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const accessTokenRef = useRef<string | null>(null);
  const [state, setState] = useState<AuthState>({ user: null, status: "loading" });
  const bootstrapped = useRef(false);

  // Wire the api client to read/write our in-memory token.
  useEffect(() => {
    configureApiClient({
      getAccessToken: () => accessTokenRef.current,
      setAccessToken: (t) => {
        accessTokenRef.current = t;
      },
      onUnauthorized: () => {
        accessTokenRef.current = null;
        setState({ user: null, status: "unauthenticated" });
      },
    });
  }, []);

  // Silent refresh on mount: try to mint an access token from the rt cookie.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    let cancelled = false;
    (async () => {
      // Cross-tab single-flighted: N tabs opened together share 1 /auth/refresh call.
      // refreshAccessToken writes the new token via the setter we configured above,
      // so accessTokenRef.current is updated as a side effect.
      const refreshed = await refreshAccessToken();
      if (cancelled) return;
      if (!refreshed) {
        setState({ user: null, status: "unauthenticated" });
        return;
      }
      try {
        const user = await meApi.get();
        if (cancelled) return;
        setState({ user, status: "authenticated" });
      } catch {
        if (cancelled) return;
        accessTokenRef.current = null;
        setState({ user: null, status: "unauthenticated" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback((resp: LoginResponse) => {
    accessTokenRef.current = resp.accessToken;
    setState({ user: resp.user, status: "authenticated" });
  }, []);

  const refreshUser = useCallback(async () => {
    if (!accessTokenRef.current) return null;
    try {
      const user = await meApi.get();
      setState({ user, status: "authenticated" });
      return user;
    } catch {
      accessTokenRef.current = null;
      setState({ user: null, status: "unauthenticated" });
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore — we're clearing local state regardless.
    }
    accessTokenRef.current = null;
    setState({ user: null, status: "unauthenticated" });
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await authApi.logoutAll();
    } catch {
      // Ignore.
    }
    accessTokenRef.current = null;
    setState({ user: null, status: "unauthenticated" });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, setSession, refreshUser, logout, logoutAll }),
    [state, setSession, refreshUser, logout, logoutAll],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
