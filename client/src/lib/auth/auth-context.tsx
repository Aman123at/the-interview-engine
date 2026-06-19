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
import { useRouter } from "next/navigation";
import { api, ApiError, onAuthFailure } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/token-store";
import type {
  InterviewerSpecialization,
  LoginRequest,
  PublicUser as User,
} from "@/contracts";

/** Periodic silent refresh interval. Server cookie TTL should be >= 2× this. */
const SILENT_REFRESH_MS = 10 * 60 * 1000;

interface AuthState {
  user: User | null;
  /**
   * Interviewer specializations, present (possibly empty) only when
   * `user.role === "interviewer"`. Server omits the field for admin / hr.
   */
  specializations: InterviewerSpecialization[] | null;
  /** True while the initial /auth/me probe is in flight. */
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (body: LoginRequest) => Promise<User>;
  logout: () => Promise<void>;
  /** Manually re-probe /auth/me. Returns the user or null. */
  refresh: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const EMPTY: AuthState = { user: null, specializations: null, loading: true };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>(EMPTY);
  // Avoid double-bouncing on auth-failure events.
  const bouncedRef = useRef(false);

  const probe = useCallback(async (): Promise<User | null> => {
    // No stored token → skip the round-trip; the user is unauthenticated.
    if (!getAccessToken()) {
      setState({ user: null, specializations: null, loading: false });
      return null;
    }
    try {
      const res = await api.auth.me();
      setState({
        user: res.user,
        specializations: res.specializations ?? null,
        loading: false,
      });
      bouncedRef.current = false;
      return res.user;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) {
        // Network or 5xx: leave loading=false but treat as unauthenticated.
        // The UI will redirect to /login; surface noise via a console warning.
        console.warn("[auth] /auth/me failed", e);
      }
      setState({ user: null, specializations: null, loading: false });
      return null;
    }
  }, []);

  // Mount-time probe.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void probe();
  }, [probe]);

  // Subscribe to silent-refresh failures from the API client.
  useEffect(() => {
    const unsub = onAuthFailure(() => {
      if (bouncedRef.current) return;
      bouncedRef.current = true;
      setState({ user: null, specializations: null, loading: false });
      router.replace("/login");
    });
    return unsub;
  }, [router]);

  // Background silent refresh — keeps the cookie warm while the tab is open.
  useEffect(() => {
    if (!state.user) return;
    const id = setInterval(() => {
      void api.auth.refresh().catch(() => {
        /* onAuthFailure already handles hard failures */
      });
    }, SILENT_REFRESH_MS);
    return () => clearInterval(id);
  }, [state.user]);

  const login = useCallback(
    async (body: LoginRequest) => {
      const res = await api.auth.login(body);
      // Seed state immediately so the redirect can branch on role; then
      // fire-and-forget a /auth/me probe to pick up `specializations`
      // (login response doesn't include them).
      setState({ user: res.user, specializations: null, loading: false });
      bouncedRef.current = false;
      void probe();
      return res.user;
    },
    [probe],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore — server-side cookie clear is best-effort from the client
    }
    setState({ user: null, specializations: null, loading: false });
    router.replace("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, refresh: probe }),
    [state, login, logout, probe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}

/** Resolve the home route for a given role. */
export function homeForRole(role: User["role"]): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "hr":
      return "/hr";
    case "interviewer":
    default:
      return "/dashboard";
  }
}
