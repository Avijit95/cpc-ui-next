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

// A non-httpOnly marker cookie — readable by JS, contains no sensitive data.
// Set on login so the bootstrap refresh is skipped for anonymous visitors entirely.
const SESSION_MARKER = "has_session";
// localStorage key written after the first-ever migration refresh attempt.
// Prevents anonymous visitors from hitting /auth/refresh on every subsequent visit
// after the initial deployment that introduced the marker cookie.
const MIGRATION_KEY = "auth_session_checked";
// localStorage key storing the last logged-in user's ID.
// Used to detect when the rt cookie belongs to a different user (e.g. another
// person logging in on the same device), so we sign out instead of silently
// switching accounts on page refresh.
const SESSION_USER_KEY = "session_user_id";

function setSessionMarker() {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${SESSION_MARKER}=1; path=/; expires=${expires}; SameSite=Lax`;
}

function clearSessionMarker() {
  document.cookie = `${SESSION_MARKER}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

function hasSessionMarker(): boolean {
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${SESSION_MARKER}=`));
}

function migrationChecked(): boolean {
  try { return !!localStorage.getItem(MIGRATION_KEY); } catch { return false; }
}

function setMigrationChecked() {
  try { localStorage.setItem(MIGRATION_KEY, "1"); } catch { /* ignore */ }
}

function getStoredUserId(): string | null {
  try { return localStorage.getItem(SESSION_USER_KEY); } catch { return null; }
}

function setStoredUserId(id: string) {
  try { localStorage.setItem(SESSION_USER_KEY, id); } catch { /* ignore */ }
}

function clearStoredUserId() {
  try { localStorage.removeItem(SESSION_USER_KEY); } catch { /* ignore */ }
}

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
      // Skip 401→refresh for visitors with no session marker — prevents
      // every anonymous product page load from calling /auth/refresh via
      // endpoints like /products/:slug/coupons that return 401 without auth.
      shouldRefresh: hasSessionMarker,
    });
  }, []);

  // Silent refresh on mount: try to mint an access token from the rt cookie.
  // Skip entirely for anonymous visitors — only attempt if the has_session marker is present.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    // Skip refresh if:
    //   - no marker (never logged in via this browser), AND
    //   - migration check already done (not a pre-marker legacy session)
  if (!hasSessionMarker() && migrationChecked()) {
  const markUnauthenticated = () => setState({ user: null, status: "unauthenticated" });
  markUnauthenticated();  // ✅
  return;
}

    let cancelled = false;
    (async () => {
      // Cross-tab single-flighted: N tabs opened together share 1 /auth/refresh call.
      // refreshAccessToken writes the new token via the setter we configured above,
      // so accessTokenRef.current is updated as a side effect.
      const refreshed = await refreshAccessToken();
      // Always mark migration done after the first attempt, regardless of outcome.
      setMigrationChecked();
      if (cancelled) return;
      if (!refreshed) {
        clearSessionMarker();
        clearStoredUserId();
        setState({ user: null, status: "unauthenticated" });
        return;
      }
      // Refresh succeeded — ensure marker is set (covers pre-marker legacy sessions).
      setSessionMarker();
      try {
        const user = await meApi.get();
        if (cancelled) return;
        // Guard against a different user's rt cookie silently taking over.
        // If a stored user ID exists and doesn't match, sign out instead.
        const storedId = getStoredUserId();
        if (storedId && storedId !== user.id) {
          accessTokenRef.current = null;
          clearSessionMarker();
          clearStoredUserId();
          setState({ user: null, status: "unauthenticated" });
          return;
        }
        setStoredUserId(user.id);
        setState({ user, status: "authenticated" });
      } catch {
        if (cancelled) return;
        accessTokenRef.current = null;
        clearSessionMarker();
        clearStoredUserId();
        setState({ user: null, status: "unauthenticated" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback((resp: LoginResponse) => {
    accessTokenRef.current = resp.accessToken;
    setSessionMarker();
    setStoredUserId(resp.user.id);
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
    clearSessionMarker();
    clearStoredUserId();
    setState({ user: null, status: "unauthenticated" });
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await authApi.logoutAll();
    } catch {
      // Ignore.
    }
    accessTokenRef.current = null;
    clearSessionMarker();
    clearStoredUserId();
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
