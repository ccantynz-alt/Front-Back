import {
  type Accessor,
  type JSX,
  createContext,
  createEffect,
  createSignal,
  useContext,
} from "solid-js";
import type { User } from "@back-to-the-future/schemas";

// ── Auth State Types ──────────────────────────────────────────────────

interface AuthState {
  currentUser: Accessor<User | null>;
  isAuthenticated: Accessor<boolean>;
  isLoading: Accessor<boolean>;
  error: Accessor<string | null>;
  login: (email: string, credential?: PublicKeyCredential) => Promise<void>;
  logout: () => Promise<void>;
  register: (email: string, displayName: string) => Promise<void>;
  checkSession: () => Promise<void>;
}

// ── Storage Keys ──────────────────────────────────────────────────────

const SESSION_TOKEN_KEY = "btf_session_token";
const USER_CACHE_KEY = "btf_user_cache";

// ── Helper: Safe localStorage Access ──────────────────────────────────

function getStorageItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable -- silently fail
  }
}

function removeStorageItem(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable -- silently fail
  }
}

// ── Auth Context ──────────────────────────────────────────────────────

const AuthContext = createContext<AuthState>();

export function AuthProvider(props: { children: JSX.Element }): JSX.Element {
  const cachedUser = getStorageItem(USER_CACHE_KEY);
  const initialUser: User | null = cachedUser ? JSON.parse(cachedUser) : null;

  const [currentUser, setCurrentUser] = createSignal<User | null>(initialUser);
  const [isLoading, setIsLoading] = createSignal<boolean>(false);
  const [error, setError] = createSignal<string | null>(null);

  const isAuthenticated: Accessor<boolean> = (): boolean => currentUser() !== null;

  // Persist user cache when user changes
  createEffect((): void => {
    const user = currentUser();
    if (user) {
      setStorageItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
      removeStorageItem(USER_CACHE_KEY);
    }
  });

  const getApiUrl = (): string => {
    if (typeof window !== "undefined") {
      const meta = import.meta as unknown as Record<string, Record<string, string> | undefined>;
      return meta.env?.VITE_PUBLIC_API_URL ?? "http://localhost:3001";
    }
    return "http://localhost:3001";
  };

  const login = async (email: string, _credential?: PublicKeyCredential): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getApiUrl()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: "Login failed" }));
        throw new Error(body.message ?? "Login failed");
      }

      const data: { token: string; user: User } = await response.json();
      setStorageItem(SESSION_TOKEN_KEY, data.token);
      setCurrentUser(data.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getStorageItem(SESSION_TOKEN_KEY);
      if (token) {
        await fetch(`${getApiUrl()}/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }).catch(() => {
          // Best-effort logout on server -- always clear local state
        });
      }
    } finally {
      removeStorageItem(SESSION_TOKEN_KEY);
      removeStorageItem(USER_CACHE_KEY);
      setCurrentUser(null);
      setIsLoading(false);
    }
  };

  const register = async (email: string, displayName: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getApiUrl()}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ message: "Registration failed" }));
        throw new Error(body.message ?? "Registration failed");
      }

      const data: { token: string; user: User } = await response.json();
      setStorageItem(SESSION_TOKEN_KEY, data.token);
      setCurrentUser(data.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const checkSession = async (): Promise<void> => {
    const token = getStorageItem(SESSION_TOKEN_KEY);
    if (!token) {
      setCurrentUser(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getApiUrl()}/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        removeStorageItem(SESSION_TOKEN_KEY);
        removeStorageItem(USER_CACHE_KEY);
        setCurrentUser(null);
        return;
      }

      const data: { user: User } = await response.json();
      setCurrentUser(data.user);
    } catch {
      // Network error -- keep cached user if available
    } finally {
      setIsLoading(false);
    }
  };

  const state: AuthState = {
    currentUser,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    register,
    checkSession,
  };

  // Use type assertion for provider pattern -- SolidJS context requires this
  const Provider = AuthContext.Provider as (props: {
    value: AuthState;
    children: JSX.Element;
  }) => JSX.Element;

  return Provider({ value: state, children: props.children });
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
