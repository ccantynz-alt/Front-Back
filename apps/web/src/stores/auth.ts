import {
  type Accessor,
  type JSX,
  createContext,
  createEffect,
  createSignal,
  useContext,
} from "solid-js";
import type { User } from "@back-to-the-future/schemas";
import { trpc } from "../lib/trpc";
import {
  registerPasskey,
  loginWithPasskey,
  verifySession,
  logoutSession,
} from "../lib/webauthn";

// ── Auth State Types ──────────────────────────────────────────────────

interface AuthState {
  currentUser: Accessor<User | null>;
  isAuthenticated: Accessor<boolean>;
  isLoading: Accessor<boolean>;
  error: Accessor<string | null>;
  login: (email?: string) => Promise<void>;
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
    // Storage full or unavailable
  }
}

function removeStorageItem(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable
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

  createEffect((): void => {
    const user = currentUser();
    if (user) {
      setStorageItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
      removeStorageItem(USER_CACHE_KEY);
    }
  });

  const login = async (email?: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const { token } = await loginWithPasskey(email);
      setStorageItem(SESSION_TOKEN_KEY, token);

      const user = await verifySession(token);
      setCurrentUser(user as User);
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
        await logoutSession(token);
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
      const { token } = await registerPasskey(email, displayName);
      setStorageItem(SESSION_TOKEN_KEY, token);

      const user = await verifySession(token);
      setCurrentUser(user as User);
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
      const user = await verifySession(token);
      setCurrentUser(user as User);
    } catch {
      removeStorageItem(SESSION_TOKEN_KEY);
      removeStorageItem(USER_CACHE_KEY);
      setCurrentUser(null);
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
